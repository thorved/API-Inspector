package handlers

import (
	"database/sql"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"api-inspector/backend/internal/proxy"
	"api-inspector/backend/internal/watch"
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

	if handler.watch != nil && handler.watch.IsEnabled(project.Slug) {
		requestBody, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
			return
		}
		_ = c.Request.Body.Close()

		expiresAt := time.Now().Add(handler.watch.Timeout())
		pending, err := handler.proxy.BuildPendingWatchRequest(project, c.Request, c.Param("path"), requestBody, expiresAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		decisionChannel := handler.watch.Queue(pending)
		timer := time.NewTimer(handler.watch.Timeout())
		defer timer.Stop()

		select {
		case decision, ok := <-decisionChannel:
			if !ok {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "watch mode decision channel closed"})
				return
			}

			if decision == watch.ActionDeny {
				c.JSON(http.StatusForbidden, gin.H{
					"error":          "request blocked by watch mode",
					"watchRequestId": pending.ID,
				})
				return
			}
			if decision == watch.ActionTimeout {
				c.JSON(http.StatusGatewayTimeout, gin.H{
					"error":          "watch mode approval timed out",
					"watchRequestId": pending.ID,
				})
				return
			}
			if decision != watch.ActionApprove {
				c.JSON(http.StatusForbidden, gin.H{
					"error":          "request blocked by watch mode",
					"watchRequestId": pending.ID,
				})
				return
			}

			result, err := handler.proxy.ForwardBuffered(c.Request.Context(), project, c.Request, c.Param("path"), requestBody)
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
			return
		case <-timer.C:
			if _, ok := handler.watch.ResolveTimeout(pending.ID); ok {
				c.JSON(http.StatusGatewayTimeout, gin.H{
					"error":          "watch mode approval timed out",
					"watchRequestId": pending.ID,
				})
				return
			}

			decision, ok := <-decisionChannel
			if !ok || decision != watch.ActionApprove {
				c.JSON(http.StatusForbidden, gin.H{
					"error":          "request blocked by watch mode",
					"watchRequestId": pending.ID,
				})
				return
			}
		case <-c.Request.Context().Done():
			handler.watch.CancelRequest(pending.ID)
			c.Abort()
			return
		}

		result, err := handler.proxy.ForwardBuffered(c.Request.Context(), project, c.Request, c.Param("path"), requestBody)
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
