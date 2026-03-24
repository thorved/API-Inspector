package main

import (
	"context"
	"errors"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"proxylens/backend/internal/config"
	"proxylens/backend/internal/db"
	"proxylens/backend/internal/handlers"
	"proxylens/backend/internal/logging"
	"proxylens/backend/internal/proxy"
	"proxylens/backend/internal/realtime"
)

func main() {
	cfg := config.Load()
	logger := logging.NewLogger()
	defer func() {
		_ = logger.Sync()
	}()

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
	if cfg.Environment == "development" {
		gin.SetMode(gin.DebugMode)
	}

	router := handlers.NewRouter(cfg, logger, store, proxyService, hub)

	server := &http.Server{
		Addr:              cfg.Address,
		Handler:           router,
		ReadHeaderTimeout: 15 * time.Second,
	}

	go func() {
		logger.Info("ProxyLens listening",
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
