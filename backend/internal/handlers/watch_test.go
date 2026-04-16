package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"go.uber.org/zap"

	"api-inspector/backend/internal/config"
	"api-inspector/backend/internal/db"
	"api-inspector/backend/internal/models"
	"api-inspector/backend/internal/proxy"
	"api-inspector/backend/internal/realtime"
	"api-inspector/backend/internal/watch"
)

func TestWatchModeOffProxyForwardsImmediately(t *testing.T) {
	var (
		mu         sync.Mutex
		callCount  int
		bodySeen   string
		headerSeen string
	)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		payload, _ := io.ReadAll(r.Body)
		_ = r.Body.Close()

		mu.Lock()
		callCount++
		bodySeen = string(payload)
		headerSeen = r.Header.Get("X-Test-Header")
		mu.Unlock()

		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte("forwarded"))
	}))
	defer upstream.Close()

	router, store, manager, cleanup := newWatchTestRouter(t, 50*time.Millisecond)
	defer cleanup()

	project := createWatchTestProject(t, store, upstream.URL)
	if manager.IsEnabled(project.Slug) {
		t.Fatal("expected watch mode to be disabled by default")
	}

	request := httptest.NewRequest(http.MethodPost, "/proxy/demo/users?x=1", strings.NewReader("hello watch"))
	request.Header.Set("Content-Type", "text/plain")
	request.Header.Set("X-Test-Header", "watch-off")
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d with body %s", recorder.Code, recorder.Body.String())
	}
	if strings.TrimSpace(recorder.Body.String()) != "forwarded" {
		t.Fatalf("expected forwarded response body, got %q", recorder.Body.String())
	}

	mu.Lock()
	defer mu.Unlock()

	if callCount != 1 {
		t.Fatalf("expected upstream to be called once, got %d", callCount)
	}
	if bodySeen != "hello watch" {
		t.Fatalf("expected upstream body hello watch, got %q", bodySeen)
	}
	if headerSeen != "watch-off" {
		t.Fatalf("expected upstream header to survive, got %q", headerSeen)
	}
}

func TestWatchModeApproveForwardsBufferedRequest(t *testing.T) {
	var (
		mu         sync.Mutex
		callCount  int
		bodySeen   string
		headerSeen string
	)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		payload, _ := io.ReadAll(r.Body)
		_ = r.Body.Close()

		mu.Lock()
		callCount++
		bodySeen = string(payload)
		headerSeen = r.Header.Get("X-Test-Header")
		mu.Unlock()

		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte("approved"))
	}))
	defer upstream.Close()

	router, store, manager, cleanup := newWatchTestRouter(t, time.Second)
	defer cleanup()

	project := createWatchTestProject(t, store, upstream.URL)
	manager.SetEnabled(project.Slug, true)

	request := httptest.NewRequest(http.MethodPost, "/proxy/demo/review", strings.NewReader("ship it"))
	request.Header.Set("Content-Type", "text/plain")
	request.Header.Set("X-Test-Header", "watch-on")
	recorder := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		router.ServeHTTP(recorder, request)
		close(done)
	}()

	pending := waitForPendingRequest(t, manager, project.Slug, 1, time.Second)
	resolvePayload := bytes.NewBufferString(`{"action":"approve"}`)
	resolveRequest := httptest.NewRequest(http.MethodPost, "/api/watch/requests/"+pending.ID+"/decision", resolvePayload)
	resolveRequest.Header.Set("Content-Type", "application/json")
	resolveRecorder := httptest.NewRecorder()
	router.ServeHTTP(resolveRecorder, resolveRequest)

	if resolveRecorder.Code != http.StatusOK {
		t.Fatalf("expected resolve to return 200, got %d with body %s", resolveRecorder.Code, resolveRecorder.Body.String())
	}

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for approved proxy request")
	}

	if recorder.Code != http.StatusAccepted {
		t.Fatalf("expected approved request to return 202, got %d with body %s", recorder.Code, recorder.Body.String())
	}
	if strings.TrimSpace(recorder.Body.String()) != "approved" {
		t.Fatalf("expected approved body, got %q", recorder.Body.String())
	}

	mu.Lock()
	defer mu.Unlock()

	if callCount != 1 {
		t.Fatalf("expected one upstream call, got %d", callCount)
	}
	if bodySeen != "ship it" {
		t.Fatalf("expected buffered body to reach upstream, got %q", bodySeen)
	}
	if headerSeen != "watch-on" {
		t.Fatalf("expected custom header to survive approval flow, got %q", headerSeen)
	}
}

func TestWatchModeDenyBlocksRequest(t *testing.T) {
	var callCount int

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	router, store, manager, cleanup := newWatchTestRouter(t, time.Second)
	defer cleanup()

	project := createWatchTestProject(t, store, upstream.URL)
	manager.SetEnabled(project.Slug, true)

	request := httptest.NewRequest(http.MethodPost, "/proxy/demo/review", strings.NewReader("deny me"))
	request.Header.Set("Content-Type", "text/plain")
	recorder := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		router.ServeHTTP(recorder, request)
		close(done)
	}()

	pending := waitForPendingRequest(t, manager, project.Slug, 1, time.Second)
	resolvePayload := bytes.NewBufferString(`{"action":"deny"}`)
	resolveRequest := httptest.NewRequest(http.MethodPost, "/api/watch/requests/"+pending.ID+"/decision", resolvePayload)
	resolveRequest.Header.Set("Content-Type", "application/json")
	resolveRecorder := httptest.NewRecorder()
	router.ServeHTTP(resolveRecorder, resolveRequest)

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for denied proxy request")
	}

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when request is denied, got %d with body %s", recorder.Code, recorder.Body.String())
	}
	if callCount != 0 {
		t.Fatalf("expected denied request to skip upstream, got %d calls", callCount)
	}

	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode deny response: %v", err)
	}
	if payload["error"] != "request blocked by watch mode" {
		t.Fatalf("unexpected deny error payload: %#v", payload)
	}
}

func TestWatchModeTimeoutReturnsGatewayTimeout(t *testing.T) {
	var callCount int

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	router, store, manager, cleanup := newWatchTestRouter(t, 25*time.Millisecond)
	defer cleanup()

	project := createWatchTestProject(t, store, upstream.URL)
	manager.SetEnabled(project.Slug, true)

	request := httptest.NewRequest(http.MethodGet, "/proxy/demo/slow", nil)
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusGatewayTimeout {
		t.Fatalf("expected 504, got %d with body %s", recorder.Code, recorder.Body.String())
	}
	if callCount != 0 {
		t.Fatalf("expected timeout request to skip upstream, got %d calls", callCount)
	}
}

func TestGetWatchStateReturnsEnabledStateAndPendingQueue(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer upstream.Close()

	router, store, manager, cleanup := newWatchTestRouter(t, time.Second)
	defer cleanup()

	project := createWatchTestProject(t, store, upstream.URL)
	manager.SetEnabled(project.Slug, true)

	request := httptest.NewRequest(http.MethodPost, "/proxy/demo/state", strings.NewReader("queued"))
	request.Header.Set("Content-Type", "text/plain")
	recorder := httptest.NewRecorder()
	done := make(chan struct{})
	go func() {
		router.ServeHTTP(recorder, request)
		close(done)
	}()

	pending := waitForPendingRequest(t, manager, project.Slug, 1, time.Second)
	stateRequest := httptest.NewRequest(http.MethodGet, "/api/watch?project=demo", nil)
	stateRecorder := httptest.NewRecorder()
	router.ServeHTTP(stateRecorder, stateRequest)

	if stateRecorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %s", stateRecorder.Code, stateRecorder.Body.String())
	}

	var state models.WatchState
	if err := json.Unmarshal(stateRecorder.Body.Bytes(), &state); err != nil {
		t.Fatalf("decode watch state: %v", err)
	}
	if !state.Enabled {
		t.Fatal("expected watch state to be enabled")
	}
	if len(state.Pending) != 1 {
		t.Fatalf("expected one pending request, got %d", len(state.Pending))
	}
	if state.Pending[0].ID != pending.ID {
		t.Fatalf("expected pending id %s, got %s", pending.ID, state.Pending[0].ID)
	}

	_, _ = manager.ResolveRequest(pending.ID, watch.ActionDeny)
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for queued request to finish")
	}
}

func TestSSEUsesDynamicEventNameForWatchEvents(t *testing.T) {
	router, store, manager, cleanup := newWatchTestRouter(t, time.Second)
	defer cleanup()

	project := createWatchTestProject(t, store, "https://example.com")

	server := httptest.NewServer(router)
	defer server.Close()

	response, err := http.Get(server.URL + "/api/events/traffic")
	if err != nil {
		t.Fatalf("open sse stream: %v", err)
	}
	defer response.Body.Close()

	lines := make(chan string, 16)
	go func() {
		buffer := make([]byte, 512)
		for {
			n, readErr := response.Body.Read(buffer)
			if n > 0 {
				lines <- string(buffer[:n])
			}
			if readErr != nil {
				return
			}
		}
	}()

	manager.SetEnabled(project.Slug, true)

	found := false
	deadline := time.After(time.Second)
	for !found {
		select {
		case chunk := <-lines:
			if strings.Contains(chunk, "event: watch.state.changed") {
				found = true
			}
		case <-deadline:
			t.Fatal("timed out waiting for watch state SSE event")
		}
	}
}

func TestWatchModeQueuesMultipleRequestsIndependently(t *testing.T) {
	var (
		mu        sync.Mutex
		callCount int
		paths     []string
	)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		callCount++
		paths = append(paths, r.URL.Path)
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer upstream.Close()

	router, store, manager, cleanup := newWatchTestRouter(t, time.Second)
	defer cleanup()

	project := createWatchTestProject(t, store, upstream.URL)
	manager.SetEnabled(project.Slug, true)

	firstRecorder := httptest.NewRecorder()
	secondRecorder := httptest.NewRecorder()

	firstDone := make(chan struct{})
	secondDone := make(chan struct{})

	go func() {
		router.ServeHTTP(firstRecorder, httptest.NewRequest(http.MethodGet, "/proxy/demo/first", nil))
		close(firstDone)
	}()

	waitForPendingRequests(t, manager, project.Slug, 1, time.Second)

	go func() {
		router.ServeHTTP(secondRecorder, httptest.NewRequest(http.MethodGet, "/proxy/demo/second", nil))
		close(secondDone)
	}()

	pending := waitForPendingRequests(t, manager, project.Slug, 2, time.Second)
	if _, err := manager.ResolveRequest(pending[0].ID, watch.ActionDeny); err != nil {
		t.Fatalf("deny first pending request: %v", err)
	}
	if _, err := manager.ResolveRequest(pending[1].ID, watch.ActionApprove); err != nil {
		t.Fatalf("approve second pending request: %v", err)
	}

	select {
	case <-firstDone:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for first queued request")
	}

	select {
	case <-secondDone:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for second queued request")
	}

	if firstRecorder.Code != http.StatusForbidden {
		t.Fatalf("expected first request to be denied, got %d", firstRecorder.Code)
	}
	if secondRecorder.Code != http.StatusOK {
		t.Fatalf("expected second request to be approved, got %d", secondRecorder.Code)
	}

	mu.Lock()
	defer mu.Unlock()

	if callCount != 1 {
		t.Fatalf("expected only approved request to hit upstream, got %d calls", callCount)
	}
	if len(paths) != 1 || paths[0] != "/second" {
		t.Fatalf("expected only /second upstream path, got %#v", paths)
	}
}

func newWatchTestRouter(t *testing.T, timeout time.Duration) (http.Handler, *db.Store, *watch.Manager, func()) {
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
		WatchTimeoutSeconds:    30,
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
	watchManager := watch.NewManager(timeout, hub)
	proxyService := proxy.NewService(cfg, logger, store, hub)
	router := NewRouter(cfg, logger, store, proxyService, hub, watchManager)

	cleanup := func() {
		_ = store.Close()
	}

	return router, store, watchManager, cleanup
}

func createWatchTestProject(t *testing.T, store *db.Store, baseURL string) models.Project {
	t.Helper()

	project, err := store.CreateProject(context.Background(), models.CreateProjectInput{
		Name:    "Demo",
		Slug:    "demo",
		BaseURL: baseURL,
	})
	if err != nil {
		t.Fatalf("create test project: %v", err)
	}

	return project
}

func waitForPendingRequest(t *testing.T, manager *watch.Manager, projectSlug string, count int, timeout time.Duration) models.PendingWatchRequest {
	t.Helper()

	requests := waitForPendingRequests(t, manager, projectSlug, count, timeout)
	return requests[count-1]
}

func waitForPendingRequests(t *testing.T, manager *watch.Manager, projectSlug string, count int, timeout time.Duration) []models.PendingWatchRequest {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		state := manager.GetState(projectSlug)
		if len(state.Pending) == count {
			return state.Pending
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("timed out waiting for %d pending requests", count)
	return nil
}
