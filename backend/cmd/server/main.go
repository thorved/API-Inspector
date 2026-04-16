package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"api-inspector/backend/internal/config"
	"api-inspector/backend/internal/db"
	"api-inspector/backend/internal/handlers"
	"api-inspector/backend/internal/logging"
	"api-inspector/backend/internal/proxy"
	"api-inspector/backend/internal/realtime"
)

func main() {
	logger := logging.NewLogger()
	defer func() {
		_ = logger.Sync()
	}()

	cfg, err := config.Load()
	if err != nil {
		logger.Fatal("failed to load config", zap.Error(err))
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	store, err := db.NewStore(ctx, cfg, logger)
	if err != nil {
		logger.Fatal("failed to initialize store", zap.Error(err))
	}
	defer store.Close()

	hub := realtime.NewHub()
	proxyService := proxy.NewService(cfg, logger, store, hub)

	gin.SetMode(gin.ReleaseMode)

	router := handlers.NewRouter(cfg, logger, store, proxyService, hub)

	server := &http.Server{
		Addr:              cfg.Address,
		Handler:           router,
		ReadHeaderTimeout: 15 * time.Second,
	}

	go func() {
		printStartupSummary(cfg)
		logger.Info("API-Inspector listening",
			zap.String("address", cfg.Address),
			zap.String("database", cfg.DatabasePath),
		)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Fatal("server failed", zap.Error(err))
		}
	}()

	<-ctx.Done()
	logger.Info("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", zap.Error(err))
	}
}

func printStartupSummary(cfg config.Config) {
	rootURL := fmt.Sprintf("http://localhost:%d", cfg.Port)
	bodyPreviewLabel := "unlimited"
	if cfg.BodyPreviewLimit > 0 {
		bodyPreviewLabel = fmt.Sprintf("%d bytes", cfg.BodyPreviewLimit)
	}

	fmt.Printf(
		"\nAPI-Inspector is ready\n"+
			"  Web UI:          %s\n"+
			"  API base:        %s/api\n"+
			"  Proxy base:      %s/proxy/{project-slug}\n"+
			"  Listen address:  %s\n"+
			"  Settings file:   %s\n"+
			"  Database file:   %s\n"+
			"  Log page size:   %d\n"+
			"  Body preview:    %s\n"+
			"  Upstream timeout:%s\n\n",
		rootURL,
		rootURL,
		rootURL,
		cfg.Address,
		displayPath(cfg.SettingsPath),
		displayPath(cfg.DatabasePath),
		cfg.LogPageSize,
		bodyPreviewLabel,
		" "+cfg.UpstreamTimeout.String(),
	)
}

func displayPath(path string) string {
	absolutePath, err := filepath.Abs(path)
	if err != nil {
		return path
	}

	return absolutePath
}
