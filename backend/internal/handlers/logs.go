package handlers

import (
	"database/sql"
	"net/http"
	"path/filepath"
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

func (handler *Handler) downloadLogFile(c *gin.Context) {
	record, err := handler.store.GetTrafficLog(c.Request.Context(), c.Param("id"))
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "log not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load log"})
		return
	}

	index, err := strconv.Atoi(strings.TrimSpace(c.Param("index")))
	if err != nil || index < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid file index"})
		return
	}

	files := record.Detail().Request.UploadedFiles
	if index >= len(files) {
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		return
	}

	selectedFile := files[index]
	if strings.TrimSpace(selectedFile.SavedPath) == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		return
	}

	dataDir := filepath.Clean(filepath.Dir(handler.config.DatabasePath))
	absolutePath := filepath.Clean(filepath.Join(dataDir, filepath.FromSlash(selectedFile.SavedPath)))
	relativePath, relErr := filepath.Rel(dataDir, absolutePath)
	if relErr != nil || strings.HasPrefix(relativePath, "..") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid file path"})
		return
	}

	if selectedFile.ContentType != "" {
		c.Header("Content-Type", selectedFile.ContentType)
	}
	c.FileAttachment(absolutePath, selectedFile.FileName)
}

func (handler *Handler) deleteLog(c *gin.Context) {
	logID := c.Param("id")
	filePaths, err := handler.store.ListStoredFilePathsByLog(c.Request.Context(), logID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load stored files"})
		return
	}

	err = handler.store.DeleteTrafficLog(c.Request.Context(), logID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "log not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete log"})
		return
	}

	handler.removeStoredFiles(filePaths)
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func (handler *Handler) clearLogs(c *gin.Context) {
	projectSlug := strings.TrimSpace(c.Query("project"))
	var (
		filePaths []string
		err       error
	)
	if projectSlug == "" {
		filePaths, err = handler.store.ListStoredFilePaths(c.Request.Context())
	} else {
		filePaths, err = handler.store.ListStoredFilePathsByProject(c.Request.Context(), projectSlug)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load stored files"})
		return
	}

	deletedCount, err := handler.store.ClearTrafficLogs(c.Request.Context(), projectSlug)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to clear logs"})
		return
	}

	handler.removeStoredFiles(filePaths)
	c.JSON(http.StatusOK, gin.H{"deletedCount": deletedCount})
}
