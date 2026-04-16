package watch

import (
	"errors"
	"strings"
	"sync"
	"time"

	"api-inspector/backend/internal/models"
	"api-inspector/backend/internal/realtime"
)

const (
	ActionApprove  = "approve"
	ActionDeny     = "deny"
	ActionTimeout  = "timeout"
	ActionCanceled = "canceled"
)

var ErrPendingRequestNotFound = errors.New("pending watch request not found")

type pendingEntry struct {
	request  models.PendingWatchRequest
	decision chan string
}

type projectState struct {
	enabled bool
	order   []string
}

type Manager struct {
	mu             sync.Mutex
	timeout        time.Duration
	timeoutSeconds int
	hub            *realtime.Hub
	projects       map[string]*projectState
	pending        map[string]*pendingEntry
}

func NewManager(timeout time.Duration, hub *realtime.Hub) *Manager {
	if timeout <= 0 {
		timeout = 30 * time.Second
	}

	return &Manager{
		timeout:        timeout,
		timeoutSeconds: int(timeout / time.Second),
		hub:            hub,
		projects:       make(map[string]*projectState),
		pending:        make(map[string]*pendingEntry),
	}
}

func (manager *Manager) Timeout() time.Duration {
	return manager.timeout
}

func (manager *Manager) TimeoutSeconds() int {
	return manager.timeoutSeconds
}

func (manager *Manager) GetState(projectSlug string) models.WatchState {
	projectSlug = strings.TrimSpace(projectSlug)

	manager.mu.Lock()
	defer manager.mu.Unlock()

	return manager.snapshotLocked(projectSlug)
}

func (manager *Manager) SetEnabled(projectSlug string, enabled bool) models.WatchState {
	projectSlug = strings.TrimSpace(projectSlug)

	manager.mu.Lock()
	state := manager.ensureProjectLocked(projectSlug)
	state.enabled = enabled
	snapshot := manager.snapshotLocked(projectSlug)
	manager.compactProjectLocked(projectSlug)
	manager.mu.Unlock()

	manager.publish(models.WatchStateChangedEvent{
		Type:  "watch.state.changed",
		State: snapshot,
	})

	return snapshot
}

func (manager *Manager) IsEnabled(projectSlug string) bool {
	projectSlug = strings.TrimSpace(projectSlug)

	manager.mu.Lock()
	defer manager.mu.Unlock()

	state, ok := manager.projects[projectSlug]
	return ok && state.enabled
}

func (manager *Manager) Queue(request models.PendingWatchRequest) <-chan string {
	manager.mu.Lock()
	state := manager.ensureProjectLocked(request.ProjectSlug)
	entry := &pendingEntry{
		request:  request,
		decision: make(chan string, 1),
	}
	manager.pending[request.ID] = entry
	state.order = append(state.order, request.ID)
	manager.mu.Unlock()

	manager.publish(models.WatchRequestedEvent{
		Type:    "watch.requested",
		Request: request,
	})

	return entry.decision
}

func (manager *Manager) ResolveRequest(id, action string) (models.PendingWatchRequest, error) {
	entry, err := manager.finalize(id)
	if err != nil {
		return models.PendingWatchRequest{}, err
	}

	manager.complete(entry, action)
	return entry.request, nil
}

func (manager *Manager) ResolveTimeout(id string) (models.PendingWatchRequest, bool) {
	entry, err := manager.finalize(id)
	if err != nil {
		return models.PendingWatchRequest{}, false
	}

	manager.complete(entry, ActionTimeout)
	return entry.request, true
}

func (manager *Manager) CancelRequest(id string) (models.PendingWatchRequest, bool) {
	entry, err := manager.finalize(id)
	if err != nil {
		return models.PendingWatchRequest{}, false
	}

	manager.complete(entry, ActionCanceled)
	return entry.request, true
}

func (manager *Manager) finalize(id string) (*pendingEntry, error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()

	entry, ok := manager.pending[id]
	if !ok {
		return nil, ErrPendingRequestNotFound
	}

	delete(manager.pending, id)
	if state, exists := manager.projects[entry.request.ProjectSlug]; exists {
		filtered := state.order[:0]
		for _, candidate := range state.order {
			if candidate != id {
				filtered = append(filtered, candidate)
			}
		}
		state.order = filtered
	}
	manager.compactProjectLocked(entry.request.ProjectSlug)

	return entry, nil
}

func (manager *Manager) complete(entry *pendingEntry, action string) {
	select {
	case entry.decision <- action:
	default:
	}
	close(entry.decision)

	manager.publish(models.WatchResolvedEvent{
		Type:        "watch.resolved",
		ProjectSlug: entry.request.ProjectSlug,
		RequestID:   entry.request.ID,
		Action:      action,
	})
}

func (manager *Manager) snapshotLocked(projectSlug string) models.WatchState {
	pending := make([]models.PendingWatchRequest, 0)
	state, ok := manager.projects[projectSlug]
	if ok {
		pending = make([]models.PendingWatchRequest, 0, len(state.order))
		for _, id := range state.order {
			entry, exists := manager.pending[id]
			if exists {
				pending = append(pending, entry.request)
			}
		}
	}

	return models.WatchState{
		ProjectSlug:    projectSlug,
		Enabled:        ok && state.enabled,
		TimeoutSeconds: manager.timeoutSeconds,
		Pending:        pending,
	}
}

func (manager *Manager) ensureProjectLocked(projectSlug string) *projectState {
	state, ok := manager.projects[projectSlug]
	if !ok {
		state = &projectState{}
		manager.projects[projectSlug] = state
	}

	return state
}

func (manager *Manager) compactProjectLocked(projectSlug string) {
	state, ok := manager.projects[projectSlug]
	if !ok {
		return
	}

	if state.enabled || len(state.order) > 0 {
		return
	}

	delete(manager.projects, projectSlug)
}

func (manager *Manager) publish(value any) {
	if manager.hub == nil {
		return
	}

	manager.hub.Publish(value)
}
