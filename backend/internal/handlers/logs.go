package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"api-inspector/backend/internal/db"
	"api-inspector/backend/internal/models"
)

func (handler *Handler) listLogs(c *gin.Context) {
	limit := handler.config.LogPageSize
	if rawLimit := strings.TrimSpace(c.Query("limit")); rawLimit != "" {
		if parsed, err := strconv.Atoi(rawLimit); err == nil && parsed > 0 && parsed <= 200 {
			limit = parsed
		}
	}

	records, nextCursor, err := handler.store.ListTrafficLogs(c.Request.Context(), db.LogFilters{
		ProjectSlug: strings.TrimSpace(c.Query("project")),
		Method:      strings.TrimSpace(c.Query("method")),
		Status:      strings.TrimSpace(c.Query("status")),
		Search:      strings.TrimSpace(c.Query("search")),
		Cursor:      strings.TrimSpace(c.Query("cursor")),
		Limit:       limit,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load logs"})
		return
	}

	items := make([]models.TrafficLogSummary, 0, len(records))
	for _, record := range records {
		items = append(items, record.Summary())
	}

	c.JSON(http.StatusOK, models.TrafficLogListResponse{
		Items:      items,
		NextCursor: nextCursor,
	})
}

func (handler *Handler) getLog(c *gin.Context) {
	record, err := handler.store.GetTrafficLog(c.Request.Context(), c.Param("id"))
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "log not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load log"})
		return
	}

	c.JSON(http.StatusOK, record.Detail())
}

func (handler *Handler) getStats(c *gin.Context) {
	stats, err := handler.store.GetStats(c.Request.Context(), strings.TrimSpace(c.Query("project")))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load stats"})
		return
	}

	c.JSON(http.StatusOK, stats)
}

func (handler *Handler) deleteLog(c *gin.Context) {
	err := handler.store.DeleteTrafficLog(c.Request.Context(), c.Param("id"))
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "log not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete log"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func (handler *Handler) clearLogs(c *gin.Context) {
	deletedCount, err := handler.store.ClearTrafficLogs(c.Request.Context(), strings.TrimSpace(c.Query("project")))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to clear logs"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"deletedCount": deletedCount})
}
