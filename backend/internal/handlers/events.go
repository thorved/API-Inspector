package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func (handler *Handler) streamTraffic(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming not supported"})
		return
	}

	client := handler.hub.Register()
	defer handler.hub.Unregister(client)

	keepAlive := time.NewTicker(20 * time.Second)
	defer keepAlive.Stop()

	c.Status(http.StatusOK)
	flusher.Flush()

	for {
		select {
		case <-c.Request.Context().Done():
			return
		case message, ok := <-client:
			if !ok {
				return
			}
			_, _ = fmt.Fprintf(c.Writer, "event: traffic.created\ndata: %s\n\n", message)
			flusher.Flush()
		case <-keepAlive.C:
			_, _ = fmt.Fprint(c.Writer, ": ping\n\n")
			flusher.Flush()
		}
	}
}
