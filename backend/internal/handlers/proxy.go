package handlers

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"api-inspector/backend/internal/proxy"
)

func (handler *Handler) forwardProxy(c *gin.Context) {
	project, err := handler.store.GetProjectBySlug(c.Request.Context(), c.Param("slug"))
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load project"})
		return
	}

	if !project.IsActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "project is inactive"})
		return
	}

	result, err := handler.proxy.Forward(c.Request.Context(), project, c.Request, c.Param("path"))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"error":   "upstream request failed",
			"details": err.Error(),
			"logId":   result.LogRecord.ID,
		})
		return
	}

	proxy.CopyResponseHeaders(c.Writer.Header(), result.ResponseHeader)
	c.Status(result.ResponseStatus)
	if _, writeErr := c.Writer.Write(result.ResponseBody); writeErr != nil {
		handler.logger.Warn("failed to write proxied response", zap.Error(writeErr))
	}
}
