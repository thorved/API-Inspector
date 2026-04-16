package config

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Address          string
	DatabasePath     string
	BodyPreviewLimit int
	LogPageSize      int
	Environment      string
	FrontendDevURL   string
	UpstreamTimeout  time.Duration
}

func Load() Config {
	return Config{
		Address:          envOrDefault("API_INSPECTOR_ADDR", ":8080"),
		DatabasePath:     envOrDefault("API_INSPECTOR_DB_PATH", filepath.Join("data", "api-inspector.db")),
		BodyPreviewLimit: envInt("API_INSPECTOR_BODY_PREVIEW_LIMIT", 0),
		LogPageSize:      envInt("API_INSPECTOR_LOG_PAGE_SIZE", 50),
		Environment:      strings.ToLower(envOrDefault("API_INSPECTOR_ENV", "development")),
		FrontendDevURL:   strings.TrimSpace(os.Getenv("API_INSPECTOR_FRONTEND_DEV_URL")),
		UpstreamTimeout:  time.Duration(envInt("API_INSPECTOR_UPSTREAM_TIMEOUT_SECONDS", 600)) * time.Second,
	}
}

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
