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
		Address:          envOrDefault("PROXYLENS_ADDR", ":8080"),
		DatabasePath:     envOrDefault("PROXYLENS_DB_PATH", filepath.Join("data", "proxylens.db")),
		BodyPreviewLimit: envInt("PROXYLENS_BODY_PREVIEW_LIMIT", 0),
		LogPageSize:      envInt("PROXYLENS_LOG_PAGE_SIZE", 50),
		Environment:      strings.ToLower(envOrDefault("PROXYLENS_ENV", "development")),
		FrontendDevURL:   strings.TrimSpace(os.Getenv("PROXYLENS_FRONTEND_DEV_URL")),
		UpstreamTimeout:  time.Duration(envInt("PROXYLENS_UPSTREAM_TIMEOUT_SECONDS", 30)) * time.Second,
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
