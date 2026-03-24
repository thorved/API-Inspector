package handlers

import (
	"embed"
	"errors"
	"io/fs"
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
)

var ErrStaticNotFound = errors.New("static asset not found")

type StaticHandler struct {
	files http.FileSystem
}

func NewStaticHandler(source embed.FS) *StaticHandler {
	subtree, err := fs.Sub(source, "dist")
	if err != nil {
		subtree = source
	}

	return &StaticHandler{
		files: http.FS(subtree),
	}
}

func (handler *StaticHandler) Serve(c *gin.Context) error {
	for _, candidate := range staticCandidates(c.Request.URL.Path) {
		file, err := handler.files.Open(candidate)
		if err != nil {
			continue
		}

		stats, err := file.Stat()
		if err != nil {
			_ = file.Close()
			return err
		}

		http.ServeContent(c.Writer, c.Request, candidate, stats.ModTime(), file)
		return file.Close()
	}

	return ErrStaticNotFound
}

func staticCandidates(requestPath string) []string {
	clean := strings.TrimPrefix(path.Clean("/"+requestPath), "/")
	if clean == "." || clean == "" {
		return []string{"index.html"}
	}

	candidates := []string{
		clean,
		clean + ".html",
		path.Join(clean, "index.html"),
	}
	if !strings.Contains(clean, ".") {
		candidates = append(candidates, "index.html")
	}

	return candidates
}
