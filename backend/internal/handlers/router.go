package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"api-inspector/backend/internal/config"
	"api-inspector/backend/internal/db"
	"api-inspector/backend/internal/proxy"
	"api-inspector/backend/internal/realtime"
	"api-inspector/backend/web"
)

type Handler struct {
	config config.Config
	logger *zap.Logger
	store  *db.Store
	proxy  *proxy.Service
	hub    *realtime.Hub
	static *StaticHandler
}

func NewRouter(cfg config.Config, logger *zap.Logger, store *db.Store, proxyService *proxy.Service, hub *realtime.Hub) *gin.Engine {
	handler := &Handler{
		config: cfg,
		logger: logger,
		store:  store,
		proxy:  proxyService,
		hub:    hub,
		static: NewStaticHandler(web.Dist),
	}

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(handler.requestLogger())
	router.Use(handler.devCORS())

	api := router.Group("/api")
	{
		api.GET("/projects", handler.listProjects)
		api.POST("/projects", handler.createProject)
		api.PUT("/projects/:slug", handler.updateProject)
		api.DELETE("/projects/:slug", handler.deleteProject)
		api.GET("/projects/:slug", handler.getProject)
		api.GET("/logs", handler.listLogs)
		api.DELETE("/logs", handler.clearLogs)
		api.GET("/logs/:id", handler.getLog)
		api.GET("/logs/:id/files/:index/download", handler.downloadLogFile)
		api.DELETE("/logs/:id", handler.deleteLog)
		api.GET("/stats", handler.getStats)
		api.GET("/events/traffic", handler.streamTraffic)
	}

	router.Any("/proxy/:slug/*path", handler.forwardProxy)
	router.NoRoute(handler.serveApp)

	return router
}

func (handler *Handler) requestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		startedAt := time.Now()
		c.Next()

		handler.logger.Info("request",
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.Int("status", c.Writer.Status()),
			zap.Duration("duration", time.Since(startedAt)),
		)
	}
}

func (handler *Handler) devCORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := strings.TrimSpace(c.GetHeader("Origin"))
		if origin != "" && handler.isAllowedDevOrigin(origin) {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Vary", "Origin")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			c.Header("Access-Control-Expose-Headers", "Content-Type")
		}

		if c.Request.Method == http.MethodOptions {
			c.Status(http.StatusNoContent)
			c.Abort()
			return
		}

		c.Next()
	}
}

func (handler *Handler) isAllowedDevOrigin(origin string) bool {
	if handler.config.FrontendDevURL != "" && origin == handler.config.FrontendDevURL {
		return true
	}

	if handler.config.Environment != "development" {
		return false
	}

	switch origin {
	case "http://localhost:3000", "http://127.0.0.1:3000":
		return true
	default:
		return false
	}
}

func (handler *Handler) serveApp(c *gin.Context) {
	if c.Request.URL.Path == "/api" || c.Request.URL.Path == "/proxy" || strings.HasPrefix(c.Request.URL.Path, "/api/") || strings.HasPrefix(c.Request.URL.Path, "/proxy/") {
		c.JSON(http.StatusNotFound, gin.H{"error": "route not found"})
		return
	}

	if err := handler.static.Serve(c); err != nil {
		if errors.Is(err, ErrStaticNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
			return
		}

		handler.logger.Error("failed to serve static asset", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to serve app"})
	}
}
