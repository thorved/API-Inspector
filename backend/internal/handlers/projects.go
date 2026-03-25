package handlers

import (
	"database/sql"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"

	"api-inspector/backend/internal/models"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

func (handler *Handler) listProjects(c *gin.Context) {
	projects, err := handler.store.ListProjects(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load projects"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"items": projects})
}

func (handler *Handler) createProject(c *gin.Context) {
	var input models.CreateProjectInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project payload"})
		return
	}

	input.Name = strings.TrimSpace(input.Name)
	input.Slug = strings.ToLower(strings.TrimSpace(input.Slug))
	input.BaseURL = strings.TrimSpace(input.BaseURL)

	switch {
	case input.Name == "":
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	case !slugPattern.MatchString(input.Slug):
		c.JSON(http.StatusBadRequest, gin.H{"error": "slug must use lowercase letters, numbers, and hyphens"})
		return
	case !validBaseURL(input.BaseURL):
		c.JSON(http.StatusBadRequest, gin.H{"error": "baseUrl must be a valid http or https url"})
		return
	}

	project, err := handler.store.CreateProject(c.Request.Context(), input)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			c.JSON(http.StatusConflict, gin.H{"error": "slug already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create project"})
		return
	}

	c.JSON(http.StatusCreated, project)
}

func (handler *Handler) updateProject(c *gin.Context) {
	var input models.UpdateProjectInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project payload"})
		return
	}

	input.Name = strings.TrimSpace(input.Name)
	input.Slug = strings.ToLower(strings.TrimSpace(input.Slug))
	input.BaseURL = strings.TrimSpace(input.BaseURL)

	switch {
	case input.Name == "":
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	case !slugPattern.MatchString(input.Slug):
		c.JSON(http.StatusBadRequest, gin.H{"error": "slug must use lowercase letters, numbers, and hyphens"})
		return
	case !validBaseURL(input.BaseURL):
		c.JSON(http.StatusBadRequest, gin.H{"error": "baseUrl must be a valid http or https url"})
		return
	}

	project, err := handler.store.UpdateProjectBySlug(c.Request.Context(), c.Param("slug"), input)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			c.JSON(http.StatusConflict, gin.H{"error": "slug already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update project"})
		return
	}

	c.JSON(http.StatusOK, project)
}

func (handler *Handler) deleteProject(c *gin.Context) {
	err := handler.store.DeleteProjectBySlug(c.Request.Context(), c.Param("slug"))
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete project"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func (handler *Handler) getProject(c *gin.Context) {
	project, err := handler.store.GetProjectBySlug(c.Request.Context(), c.Param("slug"))
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load project"})
		return
	}

	c.JSON(http.StatusOK, project)
}

func validBaseURL(value string) bool {
	parsed, err := url.Parse(value)
	if err != nil {
		return false
	}
	return (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host != ""
}
