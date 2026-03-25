package handlers

import (
	"os"
	"path/filepath"
	"strings"

	"go.uber.org/zap"
)

func (handler *Handler) removeStoredFiles(paths []string) {
	dataDir := filepath.Dir(handler.config.DatabasePath)

	for _, relativePath := range paths {
		cleanRelativePath := strings.TrimSpace(relativePath)
		if cleanRelativePath == "" {
			continue
		}

		absolutePath := filepath.Join(dataDir, filepath.FromSlash(cleanRelativePath))
		if err := os.Remove(absolutePath); err != nil && !os.IsNotExist(err) {
			handler.logger.Warn("failed to remove stored upload file", zap.String("path", absolutePath), zap.Error(err))
			continue
		}

		handler.removeEmptyUploadDirs(filepath.Dir(absolutePath), dataDir)
	}
}

func (handler *Handler) removeEmptyUploadDirs(currentDir, dataDir string) {
	uploadsRoot := filepath.Join(dataDir, "uploads")

	for {
		if currentDir == "" || currentDir == "." {
			return
		}

		relative, err := filepath.Rel(uploadsRoot, currentDir)
		if err != nil || strings.HasPrefix(relative, "..") {
			return
		}

		if currentDir == uploadsRoot {
			entries, readErr := os.ReadDir(currentDir)
			if readErr == nil && len(entries) == 0 {
				_ = os.Remove(currentDir)
			}
			return
		}

		entries, readErr := os.ReadDir(currentDir)
		if readErr != nil || len(entries) > 0 {
			return
		}

		if err := os.Remove(currentDir); err != nil && !os.IsNotExist(err) {
			return
		}

		currentDir = filepath.Dir(currentDir)
	}
}
