package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"go.uber.org/zap"

	"api-inspector/backend/internal/config"
	"api-inspector/backend/internal/db"
	"api-inspector/backend/internal/proxy"
	"api-inspector/backend/internal/realtime"
	"api-inspector/backend/internal/watch"
)

func TestGetSettingsReturnsPersistedConfig(t *testing.T) {
	router, expectedCfg, cleanup := newSettingsTestRouter(t)
	defer cleanup()

	request := httptest.NewRequest(http.MethodGet, "/api/settings", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %s", recorder.Code, recorder.Body.String())
	}

	var actual config.Config
	if err := json.Unmarshal(recorder.Body.Bytes(), &actual); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if actual.Port != expectedCfg.Port {
		t.Fatalf("expected port %d, got %d", expectedCfg.Port, actual.Port)
	}
	if actual.DatabasePath != expectedCfg.DatabasePath {
		t.Fatalf("expected database path %s, got %s", expectedCfg.DatabasePath, actual.DatabasePath)
	}
}

func TestUpdateSettingsPersistsConfigAndRequiresRestart(t *testing.T) {
	router, expectedCfg, cleanup := newSettingsTestRouter(t)
	defer cleanup()

	expectedCfg.Port = 9090
	expectedCfg.LogPageSize = 75
	expectedCfg.UpstreamTimeoutSeconds = 120

	payload, err := json.Marshal(expectedCfg)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	request := httptest.NewRequest(http.MethodPut, "/api/settings", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %s", recorder.Code, recorder.Body.String())
	}

	var response struct {
		Settings        config.Config `json:"settings"`
		RestartRequired bool          `json:"restartRequired"`
		Message         string        `json:"message"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if !response.RestartRequired {
		t.Fatal("expected restartRequired to be true")
	}
	if response.Settings.Port != 9090 {
		t.Fatalf("expected saved port 9090, got %d", response.Settings.Port)
	}

	reloaded, err := config.LoadFromPath(expectedCfg.SettingsPath)
	if err != nil {
		t.Fatalf("reload settings: %v", err)
	}

	if reloaded.Port != 9090 {
		t.Fatalf("expected persisted port 9090, got %d", reloaded.Port)
	}
	if reloaded.LogPageSize != 75 {
		t.Fatalf("expected persisted log page size 75, got %d", reloaded.LogPageSize)
	}
}

func TestUpdateSettingsRejectsInvalidValues(t *testing.T) {
	router, expectedCfg, cleanup := newSettingsTestRouter(t)
	defer cleanup()

	expectedCfg.Port = 70000
	payload, err := json.Marshal(expectedCfg)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	request := httptest.NewRequest(http.MethodPut, "/api/settings", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %s", recorder.Code, recorder.Body.String())
	}
}

func newSettingsTestRouter(t *testing.T) (http.Handler, config.Config, func()) {
	t.Helper()

	tempDir := t.TempDir()
	settingsPath := filepath.Join(tempDir, "data", "settings.conf")
	databasePath := filepath.Join(tempDir, "data", "api-inspector.db")

	cfg, err := config.Save(settingsPath, config.Config{
		Port:                   8080,
		DatabasePath:           databasePath,
		BodyPreviewLimit:       0,
		LogPageSize:            50,
		UpstreamTimeoutSeconds: 600,
	})
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}

	logger := zap.NewNop()
	store, err := db.NewStore(context.Background(), cfg, logger)
	if err != nil {
		t.Fatalf("create store: %v", err)
	}

	hub := realtime.NewHub()
	watchManager := watch.NewManager(30*time.Second, hub)
	proxyService := proxy.NewService(cfg, logger, store, hub)
	router := NewRouter(cfg, logger, store, proxyService, hub, watchManager)

	cleanup := func() {
		_ = store.Close()
	}

	return router, cfg, cleanup
}
