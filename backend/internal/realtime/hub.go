package realtime

import (
	"encoding/json"
	"sync"
)

type Hub struct {
	mu      sync.RWMutex
	clients map[chan []byte]struct{}
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[chan []byte]struct{}),
	}
}

func (hub *Hub) Register() chan []byte {
	channel := make(chan []byte, 16)

	hub.mu.Lock()
	hub.clients[channel] = struct{}{}
	hub.mu.Unlock()

	return channel
}

func (hub *Hub) Unregister(channel chan []byte) {
	hub.mu.Lock()
	if _, ok := hub.clients[channel]; ok {
		delete(hub.clients, channel)
		close(channel)
	}
	hub.mu.Unlock()
}

func (hub *Hub) Publish(value any) {
	payload, err := json.Marshal(value)
	if err != nil {
		return
	}

	hub.mu.RLock()
	for client := range hub.clients {
		select {
		case client <- payload:
		default:
		}
	}
	hub.mu.RUnlock()
}
