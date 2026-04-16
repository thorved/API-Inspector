package models

import "time"

type PendingWatchRequest struct {
	ID          string              `json:"id"`
	ProjectSlug string              `json:"projectSlug"`
	Method      string              `json:"method"`
	Path        string              `json:"path"`
	FullURL     string              `json:"fullUrl"`
	Query       map[string][]string `json:"query"`
	Headers     map[string][]string `json:"headers"`
	Body        BodyPreview         `json:"body"`
	ClientIP    string              `json:"clientIp"`
	UserAgent   string              `json:"userAgent"`
	CreatedAt   time.Time           `json:"createdAt"`
	ExpiresAt   time.Time           `json:"expiresAt"`
}

type WatchState struct {
	ProjectSlug    string                `json:"projectSlug"`
	Enabled        bool                  `json:"enabled"`
	TimeoutSeconds int                   `json:"timeoutSeconds"`
	Pending        []PendingWatchRequest `json:"pending"`
}

type WatchRequestedEvent struct {
	Type    string              `json:"type"`
	Request PendingWatchRequest `json:"request"`
}

type WatchResolvedEvent struct {
	Type        string `json:"type"`
	ProjectSlug string `json:"projectSlug"`
	RequestID   string `json:"requestId"`
	Action      string `json:"action"`
}

type WatchStateChangedEvent struct {
	Type  string     `json:"type"`
	State WatchState `json:"state"`
}
