package models

import (
	"encoding/json"
	"time"
)

type BodyPreview struct {
	Preview     string `json:"preview"`
	Size        int    `json:"size"`
	ContentType string `json:"contentType"`
	Truncated   bool   `json:"truncated"`
	Binary      bool   `json:"binary"`
}

type UploadedFile struct {
	FieldName   string `json:"fieldName"`
	FileName    string `json:"fileName"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
	SavedPath   string `json:"savedPath"`
}

type TrafficLogRecord struct {
	ID                    string
	ProjectID             string
	ProjectName           string
	ProjectSlug           string
	Method                string
	Path                  string
	FullURL               string
	QueryJSON             string
	RequestHeadersJSON    string
	RequestFilesJSON      string
	RequestBodyPreview    string
	RequestBodySize       int
	RequestContentType    string
	RequestBodyTruncated  bool
	RequestBodyBinary     bool
	ResponseStatus        int
	ResponseHeadersJSON   string
	ResponseBodyPreview   string
	ResponseBodySize      int
	ResponseContentType   string
	ResponseBodyTruncated bool
	ResponseBodyBinary    bool
	DurationMS            int64
	ErrorMessage          string
	ClientIP              string
	UserAgent             string
	CreatedAt             time.Time
}

type TrafficLogSummary struct {
	ID                  string    `json:"id"`
	ProjectID           string    `json:"projectId"`
	ProjectName         string    `json:"projectName"`
	ProjectSlug         string    `json:"projectSlug"`
	Method              string    `json:"method"`
	Path                string    `json:"path"`
	FullURL             string    `json:"fullUrl"`
	ResponseStatus      int       `json:"responseStatus"`
	DurationMS          int64     `json:"durationMs"`
	HasError            bool      `json:"hasError"`
	ErrorMessage        string    `json:"errorMessage,omitempty"`
	RequestContentType  string    `json:"requestContentType"`
	ResponseContentType string    `json:"responseContentType"`
	CreatedAt           time.Time `json:"createdAt"`
}

type TrafficLogDetail struct {
	ID         string            `json:"id"`
	Project    TrafficProjectRef `json:"project"`
	Request    TrafficSide       `json:"request"`
	Response   TrafficResponse   `json:"response"`
	DurationMS int64             `json:"durationMs"`
	Error      string            `json:"error,omitempty"`
	ClientIP   string            `json:"clientIp"`
	UserAgent  string            `json:"userAgent"`
	CreatedAt  time.Time         `json:"createdAt"`
}

type TrafficProjectRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type TrafficSide struct {
	Method        string              `json:"method,omitempty"`
	URL           string              `json:"url,omitempty"`
	Path          string              `json:"path,omitempty"`
	Query         map[string][]string `json:"query,omitempty"`
	Headers       map[string][]string `json:"headers,omitempty"`
	UploadedFiles []UploadedFile      `json:"uploadedFiles"`
	Body          BodyPreview         `json:"body"`
}

type TrafficResponse struct {
	Status  int                 `json:"status"`
	Headers map[string][]string `json:"headers,omitempty"`
	Body    BodyPreview         `json:"body"`
}

type TrafficLogEvent struct {
	Type string            `json:"type"`
	Item TrafficLogSummary `json:"item"`
}

type TrafficLogListResponse struct {
	Items      []TrafficLogSummary `json:"items"`
	NextCursor string              `json:"nextCursor,omitempty"`
}

type StatsResponse struct {
	ActiveProjects int                 `json:"activeProjects"`
	TotalRequests  int64               `json:"totalRequests"`
	SuccessCount   int64               `json:"successCount"`
	ErrorCount     int64               `json:"errorCount"`
	AverageLatency float64             `json:"averageLatencyMs"`
	RecentFailures []TrafficLogSummary `json:"recentFailures"`
	LastTrafficAt  *time.Time          `json:"lastTrafficAt,omitempty"`
}

func (record TrafficLogRecord) Summary() TrafficLogSummary {
	return TrafficLogSummary{
		ID:                  record.ID,
		ProjectID:           record.ProjectID,
		ProjectName:         record.ProjectName,
		ProjectSlug:         record.ProjectSlug,
		Method:              record.Method,
		Path:                record.Path,
		FullURL:             record.FullURL,
		ResponseStatus:      record.ResponseStatus,
		DurationMS:          record.DurationMS,
		HasError:            record.ErrorMessage != "",
		ErrorMessage:        record.ErrorMessage,
		RequestContentType:  record.RequestContentType,
		ResponseContentType: record.ResponseContentType,
		CreatedAt:           record.CreatedAt,
	}
}

func (record TrafficLogRecord) Detail() TrafficLogDetail {
	return TrafficLogDetail{
		ID: record.ID,
		Project: TrafficProjectRef{
			ID:   record.ProjectID,
			Name: record.ProjectName,
			Slug: record.ProjectSlug,
		},
		Request: TrafficSide{
			Method:        record.Method,
			URL:           record.FullURL,
			Path:          record.Path,
			Query:         mustHeaderMap(record.QueryJSON),
			Headers:       mustHeaderMap(record.RequestHeadersJSON),
			UploadedFiles: mustUploadedFiles(record.RequestFilesJSON),
			Body: BodyPreview{
				Preview:     record.RequestBodyPreview,
				Size:        record.RequestBodySize,
				ContentType: record.RequestContentType,
				Truncated:   record.RequestBodyTruncated,
				Binary:      record.RequestBodyBinary,
			},
		},
		Response: TrafficResponse{
			Status:  record.ResponseStatus,
			Headers: mustHeaderMap(record.ResponseHeadersJSON),
			Body: BodyPreview{
				Preview:     record.ResponseBodyPreview,
				Size:        record.ResponseBodySize,
				ContentType: record.ResponseContentType,
				Truncated:   record.ResponseBodyTruncated,
				Binary:      record.ResponseBodyBinary,
			},
		},
		DurationMS: record.DurationMS,
		Error:      record.ErrorMessage,
		ClientIP:   record.ClientIP,
		UserAgent:  record.UserAgent,
		CreatedAt:  record.CreatedAt,
	}
}

func mustHeaderMap(value string) map[string][]string {
	if value == "" {
		return map[string][]string{}
	}

	var result map[string][]string
	if err := json.Unmarshal([]byte(value), &result); err != nil {
		return map[string][]string{}
	}
	return result
}

func mustUploadedFiles(value string) []UploadedFile {
	if value == "" {
		return []UploadedFile{}
	}

	var result []UploadedFile
	if err := json.Unmarshal([]byte(value), &result); err != nil {
		return []UploadedFile{}
	}

	if result == nil {
		return []UploadedFile{}
	}

	return result
}
