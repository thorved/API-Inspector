package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLoadFromPathCreatesDefaultSettingsFile(t *testing.T) {
	settingsPath := filepath.Join(t.TempDir(), "data", "settings.conf")

	cfg, err := LoadFromPath(settingsPath)
	if err != nil {
		t.Fatalf("expected config to load, got error: %v", err)
	}

	if cfg.Port != 8080 {
		t.Fatalf("expected default port 8080, got %d", cfg.Port)
	}

	payload, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("expected settings file to be created, got error: %v", err)
	}

	if !strings.Contains(string(payload), `"port": 8080`) {
		t.Fatalf("expected settings file to include default port, got %s", payload)
	}
}

func TestLoadFromPathReadsExistingSettingsFile(t *testing.T) {
	settingsPath := filepath.Join(t.TempDir(), "settings.conf")
	payload := `{
  "port": 9100,
  "databasePath": "custom/data.db",
  "bodyPreviewLimit": 1024,
  "logPageSize": 25,
  "upstreamTimeoutSeconds": 42,
  "watchTimeoutSeconds": 18
}
`
	if err := os.WriteFile(settingsPath, []byte(payload), 0o644); err != nil {
		t.Fatalf("write settings file: %v", err)
	}

	cfg, err := LoadFromPath(settingsPath)
	if err != nil {
		t.Fatalf("expected config to load, got error: %v", err)
	}

	if cfg.Port != 9100 {
		t.Fatalf("expected port 9100, got %d", cfg.Port)
	}
	if cfg.DatabasePath != "custom/data.db" {
		t.Fatalf("expected custom database path, got %s", cfg.DatabasePath)
	}
	if cfg.UpstreamTimeout != 42*time.Second {
		t.Fatalf("expected 42 second timeout, got %s", cfg.UpstreamTimeout)
	}
	if cfg.WatchTimeout != 18*time.Second {
		t.Fatalf("expected 18 second watch timeout, got %s", cfg.WatchTimeout)
	}
}

func TestLoadFromPathRejectsInvalidJSON(t *testing.T) {
	settingsPath := filepath.Join(t.TempDir(), "settings.conf")
	if err := os.WriteFile(settingsPath, []byte(`{"port":`), 0o644); err != nil {
		t.Fatalf("write settings file: %v", err)
	}

	_, err := LoadFromPath(settingsPath)
	if err == nil {
		t.Fatal("expected invalid JSON to fail")
	}
	if !strings.Contains(err.Error(), "parse settings file") {
		t.Fatalf("expected parse error, got %v", err)
	}
}

func TestLoadFromPathRejectsInvalidValues(t *testing.T) {
	settingsPath := filepath.Join(t.TempDir(), "settings.conf")
	payload := `{
  "port": 0,
  "databasePath": "data/api-inspector.db",
  "bodyPreviewLimit": 0,
  "logPageSize": 50,
  "upstreamTimeoutSeconds": 600,
  "watchTimeoutSeconds": 30
}
`
	if err := os.WriteFile(settingsPath, []byte(payload), 0o644); err != nil {
		t.Fatalf("write settings file: %v", err)
	}

	_, err := LoadFromPath(settingsPath)
	if err == nil {
		t.Fatal("expected invalid values to fail")
	}
	if !strings.Contains(err.Error(), "port must be between 1 and 65535") {
		t.Fatalf("expected port validation error, got %v", err)
	}
}

func TestSaveDerivesAddressAndTimeout(t *testing.T) {
	settingsPath := filepath.Join(t.TempDir(), "settings.conf")

	cfg, err := Save(settingsPath, Config{
		Port:                   9091,
		DatabasePath:           "data/api-inspector.db",
		BodyPreviewLimit:       10,
		LogPageSize:            15,
		UpstreamTimeoutSeconds: 7,
		WatchTimeoutSeconds:    11,
	})
	if err != nil {
		t.Fatalf("expected config to save, got error: %v", err)
	}

	if cfg.Address != ":9091" {
		t.Fatalf("expected derived address :9091, got %s", cfg.Address)
	}
	if cfg.UpstreamTimeout != 7*time.Second {
		t.Fatalf("expected derived timeout of 7s, got %s", cfg.UpstreamTimeout)
	}
	if cfg.WatchTimeout != 11*time.Second {
		t.Fatalf("expected derived watch timeout of 11s, got %s", cfg.WatchTimeout)
	}
}
