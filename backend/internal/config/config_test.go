package config

import (
	"testing"
	"time"
)

func TestLoadDefaultsUpstreamTimeoutToTenMinutes(t *testing.T) {
	t.Setenv("API_INSPECTOR_UPSTREAM_TIMEOUT_SECONDS", "")

	cfg := Load()

	if cfg.UpstreamTimeout != 10*time.Minute {
		t.Fatalf("expected upstream timeout %s, got %s", 10*time.Minute, cfg.UpstreamTimeout)
	}
}

func TestLoadUsesConfiguredUpstreamTimeoutSeconds(t *testing.T) {
	t.Setenv("API_INSPECTOR_UPSTREAM_TIMEOUT_SECONDS", "42")

	cfg := Load()

	if cfg.UpstreamTimeout != 42*time.Second {
		t.Fatalf("expected upstream timeout %s, got %s", 42*time.Second, cfg.UpstreamTimeout)
	}
}
