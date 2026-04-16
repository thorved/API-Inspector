package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/oklog/ulid/v2"
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
	uploadsDir       string
}

type Result struct {
	ResponseStatus int
	ResponseHeader http.Header
	ResponseBody   []byte
	LogRecord      models.TrafficLogRecord
}

func NewService(cfg config.Config, logger *zap.Logger, store *db.Store, hub *realtime.Hub) *Service {
	uploadsDir := filepath.Join(filepath.Dir(cfg.DatabasePath), "uploads")
	if err := os.MkdirAll(uploadsDir, 0o755); err != nil {
		logger.Warn("failed to ensure uploads directory", zap.String("path", uploadsDir), zap.Error(err))
	}

	return &Service{
		client: &http.Client{
			Timeout: cfg.UpstreamTimeout,
		},
		logger:           logger,
		store:            store,
		hub:              hub,
		bodyPreviewLimit: cfg.BodyPreviewLimit,
		uploadsDir:       uploadsDir,
	}
}

func (service *Service) Forward(ctx context.Context, project models.Project, request *http.Request, wildcardPath string) (Result, error) {
	requestBody, err := io.ReadAll(request.Body)
	if err != nil {
		return Result{}, fmt.Errorf("read request body: %w", err)
	}
	_ = request.Body.Close()

	return service.ForwardBuffered(ctx, project, request, wildcardPath, requestBody)
}

func (service *Service) ForwardBuffered(ctx context.Context, project models.Project, request *http.Request, wildcardPath string, requestBody []byte) (Result, error) {
	startedAt := time.Now()

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
	recordID := ulid.Make().String()
	requestFiles, saveFilesErr := service.storeRequestFiles(
		project.Slug,
		recordID,
		request.Header.Get("Content-Type"),
		request.Header,
		request.URL.Path,
		requestBody,
	)
	if saveFilesErr != nil {
		service.logger.Warn("failed to store uploaded files", zap.String("logId", recordID), zap.Error(saveFilesErr))
	}
	record := models.TrafficLogRecord{
		ID:                   recordID,
		ProjectID:            project.ID,
		ProjectName:          project.Name,
		ProjectSlug:          project.Slug,
		Method:               request.Method,
		Path:                 normalizeWildcardPath(wildcardPath),
		FullURL:              targetURL,
		QueryJSON:            mustJSON(request.URL.Query()),
		RequestHeadersJSON:   mustJSON(request.Header),
		RequestFilesJSON:     mustJSON(requestFiles),
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

func (service *Service) BuildPendingWatchRequest(project models.Project, request *http.Request, wildcardPath string, requestBody []byte, expiresAt time.Time) (models.PendingWatchRequest, error) {
	targetURL, err := buildTargetURL(project.BaseURL, wildcardPath, request.URL.Query())
	if err != nil {
		return models.PendingWatchRequest{}, err
	}

	createdAt := time.Now().UTC()
	requestPreview := captureBodyPreview(requestBody, request.Header.Get("Content-Type"), service.bodyPreviewLimit)

	return models.PendingWatchRequest{
		ID:          ulid.Make().String(),
		ProjectSlug: project.Slug,
		Method:      request.Method,
		Path:        normalizeWildcardPath(wildcardPath),
		FullURL:     targetURL,
		Query:       cloneStringSliceMap(map[string][]string(request.URL.Query())),
		Headers:     cloneStringSliceMap(map[string][]string(request.Header.Clone())),
		Body:        requestPreview,
		ClientIP:    request.RemoteAddr,
		UserAgent:   request.UserAgent(),
		CreatedAt:   createdAt,
		ExpiresAt:   expiresAt.UTC(),
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

func (service *Service) storeRequestFiles(projectSlug, logID, contentType string, headers http.Header, requestPath string, body []byte) ([]models.UploadedFile, error) {
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err == nil && strings.HasPrefix(strings.ToLower(mediaType), "multipart/") {
		boundary := strings.TrimSpace(params["boundary"])
		if boundary == "" {
			return []models.UploadedFile{}, nil
		}

		logUploadsDir := filepath.Join(service.uploadsDir, projectSlug, logID)
		if err := os.MkdirAll(logUploadsDir, 0o755); err != nil {
			return nil, fmt.Errorf("create upload directory: %w", err)
		}

		reader := multipart.NewReader(bytes.NewReader(body), boundary)
		files := make([]models.UploadedFile, 0)

		for index := 0; ; index++ {
			part, err := reader.NextPart()
			if err == io.EOF {
				break
			}
			if err != nil {
				return files, err
			}

			fileName := strings.TrimSpace(part.FileName())
			if fileName == "" {
				_, _ = io.Copy(io.Discard, part)
				_ = part.Close()
				continue
			}

			savedFile, saveErr := service.saveUploadFile(
				projectSlug,
				logID,
				strings.TrimSpace(part.FormName()),
				fileName,
				strings.TrimSpace(part.Header.Get("Content-Type")),
				part,
			)
			_ = part.Close()
			if saveErr != nil {
				return files, saveErr
			}
			files = append(files, savedFile)
		}

		return files, nil
	}

	if len(body) == 0 || isTextualBody(contentType, body) {
		return []models.UploadedFile{}, nil
	}

	fileName := inferRawUploadFileName(headers, requestPath, contentType)
	file, err := service.saveUploadFile(
		projectSlug,
		logID,
		"body",
		fileName,
		strings.TrimSpace(contentType),
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, err
	}

	return []models.UploadedFile{file}, nil
}

func (service *Service) saveUploadFile(projectSlug, logID, fieldName, fileName, contentType string, source io.Reader) (models.UploadedFile, error) {
	safeName := sanitizeFileName(fileName)
	relativePath, absolutePath, err := service.buildUniqueUploadPath(projectSlug, logID, safeName)
	if err != nil {
		return models.UploadedFile{}, err
	}

	if err := os.MkdirAll(filepath.Dir(absolutePath), 0o755); err != nil {
		return models.UploadedFile{}, fmt.Errorf("create upload file directory: %w", err)
	}

	output, err := os.Create(absolutePath)
	if err != nil {
		return models.UploadedFile{}, fmt.Errorf("create upload file: %w", err)
	}

	size, copyErr := io.Copy(output, source)
	closeErr := output.Close()
	if copyErr != nil {
		return models.UploadedFile{}, fmt.Errorf("write upload file: %w", copyErr)
	}
	if closeErr != nil {
		return models.UploadedFile{}, fmt.Errorf("finalize upload file: %w", closeErr)
	}

	return models.UploadedFile{
		FieldName:   fieldName,
		FileName:    safeName,
		ContentType: contentType,
		Size:        size,
		SavedPath:   relativePath,
	}, nil
}

func (service *Service) buildUniqueUploadPath(projectSlug, logID, fileName string) (string, string, error) {
	logDir := filepath.Join(service.uploadsDir, projectSlug, logID)
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return "", "", fmt.Errorf("create upload directory: %w", err)
	}

	extension := filepath.Ext(fileName)
	baseName := strings.TrimSuffix(fileName, extension)
	if baseName == "" {
		baseName = "upload"
	}

	for index := 0; ; index++ {
		candidateName := fileName
		if index > 0 {
			candidateName = fmt.Sprintf("%s-%d%s", baseName, index+1, extension)
		}

		relativePath := filepath.ToSlash(filepath.Join("uploads", projectSlug, logID, candidateName))
		absolutePath := filepath.Join(filepath.Dir(service.uploadsDir), filepath.FromSlash(relativePath))
		if _, err := os.Stat(absolutePath); os.IsNotExist(err) {
			return relativePath, absolutePath, nil
		} else if err != nil {
			return "", "", fmt.Errorf("check upload file path: %w", err)
		}
	}
}

func sanitizeFileName(value string) string {
	name := strings.TrimSpace(filepath.Base(value))
	name = strings.ReplaceAll(name, "..", "")
	name = strings.ReplaceAll(name, "/", "-")
	name = strings.ReplaceAll(name, "\\", "-")
	if name == "" || name == "." {
		return "upload.bin"
	}
	return name
}

func inferRawUploadFileName(headers http.Header, requestPath, contentType string) string {
	if contentDisposition := strings.TrimSpace(headers.Get("Content-Disposition")); contentDisposition != "" {
		if _, params, err := mime.ParseMediaType(contentDisposition); err == nil {
			if fileName := strings.TrimSpace(params["filename"]); fileName != "" {
				return fileName
			}
		}
	}

	for _, headerName := range []string{"X-File-Name", "X-Filename", "X-Upload-Filename"} {
		if fileName := strings.TrimSpace(headers.Get(headerName)); fileName != "" {
			return fileName
		}
	}

	baseName := "upload"
	if requestPath != "" {
		pathBaseName := strings.TrimSpace(path.Base(requestPath))
		if pathBaseName != "" && pathBaseName != "/" && pathBaseName != "." {
			if extension := filepath.Ext(pathBaseName); extension != "" {
				baseName += extension
				return baseName
			}
		}
	}

	if filepath.Ext(baseName) == "" {
		if extensions, err := mime.ExtensionsByType(contentType); err == nil && len(extensions) > 0 {
			baseName += extensions[0]
		}
	}

	return baseName
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

func cloneStringSliceMap(source map[string][]string) map[string][]string {
	if len(source) == 0 {
		return map[string][]string{}
	}

	cloned := make(map[string][]string, len(source))
	for key, values := range source {
		if len(values) == 0 {
			cloned[key] = []string{}
			continue
		}

		items := make([]string, len(values))
		copy(items, values)
		cloned[key] = items
	}

	return cloned
}
