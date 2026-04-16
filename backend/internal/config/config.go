package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	defaultSettingsFile = "settings.conf"
	defaultDataDir      = "data"
)

type Config struct {
	SettingsPath           string        `json:"-"`
	Address                string        `json:"-"`
	Port                   int           `json:"port"`
	DatabasePath           string        `json:"databasePath"`
	BodyPreviewLimit       int           `json:"bodyPreviewLimit"`
	LogPageSize            int           `json:"logPageSize"`
	UpstreamTimeoutSeconds int           `json:"upstreamTimeoutSeconds"`
	UpstreamTimeout        time.Duration `json:"-"`
}

type ValidationError struct {
	Message string
}

func (err ValidationError) Error() string {
	return err.Message
}

func DefaultSettingsPath() string {
	return filepath.Join(defaultDataDir, defaultSettingsFile)
}

func Default() Config {
	cfg := Config{
		Port:                   8080,
		DatabasePath:           filepath.Join(defaultDataDir, "api-inspector.db"),
		BodyPreviewLimit:       0,
		LogPageSize:            50,
		UpstreamTimeoutSeconds: 600,
	}
	cfg.SettingsPath = DefaultSettingsPath()
	cfg.applyDerived()
	return cfg
}

func Load() (Config, error) {
	return LoadFromPath(DefaultSettingsPath())
}

func LoadFromPath(path string) (Config, error) {
	settingsPath := filepath.Clean(path)
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		return Config{}, fmt.Errorf("create settings dir: %w", err)
	}

	if _, err := os.Stat(settingsPath); errors.Is(err, os.ErrNotExist) {
		if _, err := Save(settingsPath, Default()); err != nil {
			return Config{}, err
		}
	} else if err != nil {
		return Config{}, fmt.Errorf("stat settings file: %w", err)
	}

	payload, err := os.ReadFile(settingsPath)
	if err != nil {
		return Config{}, fmt.Errorf("read settings file: %w", err)
	}

	cfg := Default()
	if err := json.Unmarshal(payload, &cfg); err != nil {
		return Config{}, fmt.Errorf("parse settings file: %w", err)
	}

	cfg.SettingsPath = settingsPath
	cfg.normalize()
	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	cfg.applyDerived()
	return cfg, nil
}

func Save(path string, cfg Config) (Config, error) {
	settingsPath := filepath.Clean(path)
	cfg.SettingsPath = settingsPath
	cfg.normalize()
	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	cfg.applyDerived()

	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		return Config{}, fmt.Errorf("create settings dir: %w", err)
	}

	payload, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return Config{}, fmt.Errorf("marshal settings file: %w", err)
	}
	payload = append(payload, '\n')

	if err := writeFileAtomic(settingsPath, payload, 0o644); err != nil {
		return Config{}, fmt.Errorf("write settings file: %w", err)
	}

	return cfg, nil
}

func (cfg *Config) Validate() error {
	switch {
	case cfg.Port < 1 || cfg.Port > 65535:
		return ValidationError{Message: "port must be between 1 and 65535"}
	case strings.TrimSpace(cfg.DatabasePath) == "":
		return ValidationError{Message: "databasePath is required"}
	case cfg.BodyPreviewLimit < 0:
		return ValidationError{Message: "bodyPreviewLimit must be zero or greater"}
	case cfg.LogPageSize < 1 || cfg.LogPageSize > 200:
		return ValidationError{Message: "logPageSize must be between 1 and 200"}
	case cfg.UpstreamTimeoutSeconds < 1:
		return ValidationError{Message: "upstreamTimeoutSeconds must be greater than zero"}
	}

	return nil
}

func (cfg *Config) normalize() {
	cfg.DatabasePath = strings.TrimSpace(cfg.DatabasePath)
}

func (cfg *Config) applyDerived() {
	cfg.Address = ":" + strconv.Itoa(cfg.Port)
	cfg.UpstreamTimeout = time.Duration(cfg.UpstreamTimeoutSeconds) * time.Second
}

func writeFileAtomic(path string, payload []byte, perm os.FileMode) error {
	tempFile, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}

	tempPath := tempFile.Name()
	success := false
	defer func() {
		_ = tempFile.Close()
		if !success {
			_ = os.Remove(tempPath)
		}
	}()

	if _, err := tempFile.Write(payload); err != nil {
		return err
	}
	if err := tempFile.Chmod(perm); err != nil {
		return err
	}
	if err := tempFile.Sync(); err != nil {
		return err
	}
	if err := tempFile.Close(); err != nil {
		return err
	}
	if err := replaceFile(tempPath, path); err != nil {
		return err
	}

	success = true
	return nil
}
