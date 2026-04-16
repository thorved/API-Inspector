package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	appconfig "api-inspector/backend/internal/config"
)

type updateSettingsResponse struct {
	Settings        appconfig.Config `json:"settings"`
	RestartRequired bool             `json:"restartRequired"`
	Message         string           `json:"message"`
}

func (handler *Handler) getSettings(c *gin.Context) {
	cfg, err := appconfig.LoadFromPath(handler.config.SettingsPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load settings"})
		return
	}

	c.JSON(http.StatusOK, cfg)
}

func (handler *Handler) updateSettings(c *gin.Context) {
	var input appconfig.Config
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid settings payload"})
		return
	}

	saved, err := appconfig.Save(handler.config.SettingsPath, input)
	if err != nil {
		if validationError(err) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save settings"})
		return
	}

	c.JSON(http.StatusOK, updateSettingsResponse{
		Settings:        saved,
		RestartRequired: true,
		Message:         "Settings saved. Restart API-Inspector for changes to take effect.",
	})
}

func validationError(err error) bool {
	var validationErr appconfig.ValidationError
	return errors.As(err, &validationErr)
}
