package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"api-inspector/backend/internal/watch"
)

type updateWatchStateInput struct {
	ProjectSlug string `json:"projectSlug"`
	Enabled     bool   `json:"enabled"`
}

type resolveWatchRequestInput struct {
	Action string `json:"action"`
}

func (handler *Handler) getWatchState(c *gin.Context) {
	projectSlug := strings.TrimSpace(c.Query("project"))
	if projectSlug == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "project query parameter is required"})
		return
	}

	c.JSON(http.StatusOK, handler.watch.GetState(projectSlug))
}

func (handler *Handler) updateWatchState(c *gin.Context) {
	var input updateWatchStateInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid watch state payload"})
		return
	}

	projectSlug := strings.TrimSpace(input.ProjectSlug)
	if projectSlug == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "projectSlug is required"})
		return
	}

	if _, err := handler.store.GetProjectBySlug(c.Request.Context(), projectSlug); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load project"})
		return
	}

	c.JSON(http.StatusOK, handler.watch.SetEnabled(projectSlug, input.Enabled))
}

func (handler *Handler) resolveWatchRequest(c *gin.Context) {
	var input resolveWatchRequestInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid watch decision payload"})
		return
	}

	action := strings.TrimSpace(strings.ToLower(input.Action))
	switch action {
	case watch.ActionApprove, watch.ActionDeny:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "action must be approve or deny"})
		return
	}

	request, err := handler.watch.ResolveRequest(c.Param("id"), action)
	if err != nil {
		if errors.Is(err, watch.ErrPendingRequestNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "watch request not found"})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to resolve watch request"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"resolved": true,
		"request":  request,
		"action":   action,
	})
}
