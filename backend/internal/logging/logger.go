package logging

import "go.uber.org/zap"

func NewLogger() *zap.Logger {
	logger, err := zap.NewProduction()
	if err != nil {
		return zap.NewNop()
	}
	return logger
}
