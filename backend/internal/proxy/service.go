package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/textproto"
	"net/url"
	"path"
	"strings"
	"time"
	"unicode/utf8"

	"go.uber.org/zap"

	"api-inspector/backend/internal/config"
	"api-inspector/backend/internal/db"
	"api-inspector/backend/internal/models"
	"api-inspector/backend/internal/realtime"
)

type Service struct {
	client           *http.Client
	logger           *zap.Logger
	store            *db.Store
	hub              *realtime.Hub
	bodyPreviewLimit int
}

type Result struct {
	ResponseStatus int
	ResponseHeader http.Header
	ResponseBody   []byte
	LogRecord      models.TrafficLogRecord
}

func NewService(cfg config.Config, logger *zap.Logger, store *db.Store, hub *realtime.Hub) *Service {
	return &Service{
		client: &http.Client{
			Timeout: cfg.UpstreamTimeout,
		},
		logger:           logger,
		store:            store,
		hub:              hub,
		bodyPreviewLimit: cfg.BodyPreviewLimit,
	}
}

func (service *Service) Forward(ctx context.Context, project models.Project, request *http.Request, wildcardPath string) (Result, error) {
	startedAt := time.Now()

	requestBody, err := io.ReadAll(request.Body)
	if err != nil {
		return Result{}, fmt.Errorf("read request body: %w", err)
	}
	_ = request.Body.Close()

	targetURL, err := buildTargetURL(project.BaseURL, wildcardPath, request.URL.Query())
	if err != nil {
		return Result{}, err
	}

	outboundRequest, err := http.NewRequestWithContext(ctx, request.Method, targetURL, bytes.NewReader(requestBody))
	if err != nil {
		return Result{}, fmt.Errorf("create upstream request: %w", err)
	}

	copyRequestHeaders(outboundRequest.Header, request.Header)
	outboundRequest.Header.Set("X-Forwarded-Host", request.Host)
	outboundRequest.Header.Set("X-Forwarded-Proto", request.URL.Scheme)
	outboundRequest.Header.Set("X-Forwarded-For", request.RemoteAddr)

	response, upstreamErr := service.client.Do(outboundRequest)
	duration := time.Since(startedAt)

	requestPreview := captureBodyPreview(requestBody, request.Header.Get("Content-Type"), service.bodyPreviewLimit)
	record := models.TrafficLogRecord{
		ProjectID:            project.ID,
		ProjectName:          project.Name,
		ProjectSlug:          project.Slug,
		Method:               request.Method,
		Path:                 normalizeWildcardPath(wildcardPath),
		FullURL:              targetURL,
		QueryJSON:            mustJSON(request.URL.Query()),
		RequestHeadersJSON:   mustJSON(request.Header),
		RequestBodyPreview:   requestPreview.Preview,
		RequestBodySize:      requestPreview.Size,
		RequestContentType:   requestPreview.ContentType,
		RequestBodyTruncated: requestPreview.Truncated,
		RequestBodyBinary:    requestPreview.Binary,
		DurationMS:           duration.Milliseconds(),
		ClientIP:             request.RemoteAddr,
		UserAgent:            request.UserAgent(),
	}

	if upstreamErr != nil {
		record.ErrorMessage = upstreamErr.Error()
		record.ResponseHeadersJSON = mustJSON(map[string][]string{})
		record.ResponseBodyPreview = ""
		record.ResponseContentType = ""
		record.ResponseBodySize = 0

		if err := service.store.InsertTrafficLog(ctx, &record); err != nil {
			service.logger.Error("persist proxy failure log failed", zap.Error(err))
		} else {
			service.hub.Publish(models.TrafficLogEvent{Type: "traffic.created", Item: record.Summary()})
		}

		return Result{LogRecord: record}, upstreamErr
	}
	defer response.Body.Close()

	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		return Result{}, fmt.Errorf("read upstream response: %w", err)
	}

	responsePreview := captureBodyPreview(responseBody, response.Header.Get("Content-Type"), service.bodyPreviewLimit)
	record.ResponseStatus = response.StatusCode
	record.ResponseHeadersJSON = mustJSON(response.Header)
	record.ResponseBodyPreview = responsePreview.Preview
	record.ResponseBodySize = responsePreview.Size
	record.ResponseContentType = responsePreview.ContentType
	record.ResponseBodyTruncated = responsePreview.Truncated
	record.ResponseBodyBinary = responsePreview.Binary

	if err := service.store.InsertTrafficLog(ctx, &record); err != nil {
		service.logger.Error("persist traffic log failed", zap.Error(err))
	} else {
		service.hub.Publish(models.TrafficLogEvent{Type: "traffic.created", Item: record.Summary()})
	}

	return Result{
		ResponseStatus: response.StatusCode,
		ResponseHeader: response.Header.Clone(),
		ResponseBody:   responseBody,
		LogRecord:      record,
	}, nil
}

func buildTargetURL(baseURL, wildcardPath string, query url.Values) (string, error) {
	parsedBase, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("invalid base url: %w", err)
	}

	if parsedBase.Scheme == "" || parsedBase.Host == "" {
		return "", fmt.Errorf("base url must include scheme and host")
	}

	targetPath := normalizeWildcardPath(wildcardPath)
	parsedBase.Path = joinURLPath(parsedBase.Path, targetPath)

	mergedQuery := parsedBase.Query()
	for key, values := range query {
		for _, value := range values {
			mergedQuery.Add(key, value)
		}
	}
	parsedBase.RawQuery = mergedQuery.Encode()

	return parsedBase.String(), nil
}

func normalizeWildcardPath(wildcardPath string) string {
	if wildcardPath == "" || wildcardPath == "/" {
		return "/"
	}
	if !strings.HasPrefix(wildcardPath, "/") {
		return "/" + wildcardPath
	}
	return wildcardPath
}

func joinURLPath(basePath, proxyPath string) string {
	if proxyPath == "/" {
		if basePath == "" {
			return "/"
		}
		return basePath
	}

	cleanBase := strings.TrimSuffix(basePath, "/")
	cleanProxy := strings.TrimPrefix(proxyPath, "/")
	if cleanBase == "" {
		return "/" + cleanProxy
	}
	return path.Clean(cleanBase + "/" + cleanProxy)
}

func copyRequestHeaders(destination http.Header, source http.Header) {
	for key, values := range source {
		if shouldSkipForwardHeader(key) {
			continue
		}
		for _, value := range values {
			destination.Add(key, value)
		}
	}
}

func CopyResponseHeaders(destination http.Header, source http.Header) {
	for key, values := range source {
		if shouldSkipForwardHeader(key) {
			continue
		}
		destination.Del(key)
		for _, value := range values {
			destination.Add(key, value)
		}
	}
}

func shouldSkipForwardHeader(header string) bool {
	switch textproto.CanonicalMIMEHeaderKey(header) {
	case "Connection", "Proxy-Connection", "Keep-Alive", "Proxy-Authenticate", "Proxy-Authorization", "Te", "Trailer", "Transfer-Encoding", "Upgrade", "Host":
		return true
	default:
		return false
	}
}

func captureBodyPreview(body []byte, contentType string, limit int) models.BodyPreview {
	detectedContentType := strings.TrimSpace(contentType)
	if detectedContentType == "" && len(body) > 0 {
		snippet := body
		if len(snippet) > 512 {
			snippet = snippet[:512]
		}
		detectedContentType = http.DetectContentType(snippet)
	}

	preview := models.BodyPreview{
		Size:        len(body),
		ContentType: detectedContentType,
	}

	if len(body) == 0 {
		return preview
	}

	if !isTextualBody(detectedContentType, body) {
		preview.Binary = true
		return preview
	}

	if limit <= 0 {
		limit = len(body)
	}

	if len(body) > limit {
		preview.Preview = string(body[:limit])
		preview.Truncated = true
		return preview
	}

	preview.Preview = string(body)
	return preview
}

func isTextualBody(contentType string, body []byte) bool {
	lower := strings.ToLower(contentType)
	if strings.HasPrefix(lower, "text/") {
		return true
	}

	for _, allowed := range []string{"json", "xml", "javascript", "x-www-form-urlencoded", "graphql"} {
		if strings.Contains(lower, allowed) {
			return true
		}
	}

	return utf8.Valid(body)
}

func mustJSON(value any) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(encoded)
}
