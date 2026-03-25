package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
	"go.uber.org/zap"
	_ "modernc.org/sqlite"

	"api-inspector/backend/internal/config"
	"api-inspector/backend/internal/models"
)

type Store struct {
	db     *sql.DB
	logger *zap.Logger
}

type LogFilters struct {
	ProjectSlug string
	Method      string
	Status      string
	Search      string
	Cursor      string
	Limit       int
}

func NewStore(ctx context.Context, cfg config.Config, logger *zap.Logger) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(cfg.DatabasePath), 0o755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)", filepath.ToSlash(cfg.DatabasePath))
	database, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	store := &Store{db: database, logger: logger}
	if err := store.migrate(ctx); err != nil {
		_ = database.Close()
		return nil, err
	}

	return store, nil
}

func (store *Store) Close() error {
	return store.db.Close()
}

func (store *Store) migrate(ctx context.Context) error {
	if err := store.applyMigrations(ctx); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}

	return nil
}

func (store *Store) ListProjects(ctx context.Context) ([]models.Project, error) {
	rows, err := store.db.QueryContext(ctx, `
		SELECT id, name, slug, base_url, is_active, created_at, updated_at
		FROM projects
		ORDER BY name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := make([]models.Project, 0)
	for rows.Next() {
		project, err := scanProject(rows)
		if err != nil {
			return nil, err
		}
		projects = append(projects, project)
	}

	return projects, rows.Err()
}

func (store *Store) CreateProject(ctx context.Context, input models.CreateProjectInput) (models.Project, error) {
	now := time.Now().UTC()
	id := ulid.Make().String()
	isActive := true
	if input.IsActive != nil {
		isActive = *input.IsActive
	}

	project := models.Project{
		ID:        id,
		Name:      strings.TrimSpace(input.Name),
		Slug:      strings.TrimSpace(input.Slug),
		BaseURL:   strings.TrimSpace(input.BaseURL),
		IsActive:  isActive,
		CreatedAt: now,
		UpdatedAt: now,
	}

	_, err := store.db.ExecContext(ctx, `
		INSERT INTO projects (id, name, slug, base_url, is_active, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, project.ID, project.Name, project.Slug, project.BaseURL, boolToInt(project.IsActive), project.CreatedAt.Format(time.RFC3339Nano), project.UpdatedAt.Format(time.RFC3339Nano))
	if err != nil {
		return models.Project{}, err
	}

	return project, nil
}

func (store *Store) GetProjectBySlug(ctx context.Context, slug string) (models.Project, error) {
	row := store.db.QueryRowContext(ctx, `
		SELECT id, name, slug, base_url, is_active, created_at, updated_at
		FROM projects
		WHERE slug = ?
		LIMIT 1
	`, slug)

	return scanProject(row)
}

func (store *Store) UpdateProjectBySlug(ctx context.Context, currentSlug string, input models.UpdateProjectInput) (models.Project, error) {
	project, err := store.GetProjectBySlug(ctx, currentSlug)
	if err != nil {
		return models.Project{}, err
	}

	project.Name = strings.TrimSpace(input.Name)
	project.Slug = strings.TrimSpace(input.Slug)
	project.BaseURL = strings.TrimSpace(input.BaseURL)
	if input.IsActive != nil {
		project.IsActive = *input.IsActive
	}
	project.UpdatedAt = time.Now().UTC()

	_, err = store.db.ExecContext(ctx, `
		UPDATE projects
		SET name = ?, slug = ?, base_url = ?, is_active = ?, updated_at = ?
		WHERE id = ?
	`, project.Name, project.Slug, project.BaseURL, boolToInt(project.IsActive), project.UpdatedAt.Format(time.RFC3339Nano), project.ID)
	if err != nil {
		return models.Project{}, err
	}

	return project, nil
}

func (store *Store) DeleteProjectBySlug(ctx context.Context, slug string) error {
	result, err := store.db.ExecContext(ctx, `DELETE FROM projects WHERE slug = ?`, slug)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return sql.ErrNoRows
	}

	return nil
}

func (store *Store) InsertTrafficLog(ctx context.Context, record *models.TrafficLogRecord) error {
	if strings.TrimSpace(record.ID) == "" {
		record.ID = ulid.Make().String()
	}
	record.CreatedAt = time.Now().UTC()

	_, err := store.db.ExecContext(ctx, `
		INSERT INTO traffic_logs (
			id, project_id, method, path, full_url, query_json, request_headers_json,
			request_files_json,
			request_body_preview, request_body_size, request_content_type, request_body_truncated, request_body_binary,
			response_status, response_headers_json, response_body_preview, response_body_size, response_content_type,
			response_body_truncated, response_body_binary, duration_ms, error_message, client_ip, user_agent, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, record.ID, record.ProjectID, record.Method, record.Path, record.FullURL, record.QueryJSON, record.RequestHeadersJSON,
		record.RequestFilesJSON,
		record.RequestBodyPreview, record.RequestBodySize, record.RequestContentType, boolToInt(record.RequestBodyTruncated), boolToInt(record.RequestBodyBinary),
		record.ResponseStatus, record.ResponseHeadersJSON, record.ResponseBodyPreview, record.ResponseBodySize, record.ResponseContentType,
		boolToInt(record.ResponseBodyTruncated), boolToInt(record.ResponseBodyBinary), record.DurationMS, record.ErrorMessage, record.ClientIP, record.UserAgent,
		record.CreatedAt.Format(time.RFC3339Nano))

	return err
}

func (store *Store) GetTrafficLog(ctx context.Context, id string) (models.TrafficLogRecord, error) {
	row := store.db.QueryRowContext(ctx, `
		SELECT
			l.id, p.id, p.name, p.slug, l.method, l.path, l.full_url, l.query_json,
			l.request_headers_json, l.request_files_json, l.request_body_preview, l.request_body_size, l.request_content_type,
			l.request_body_truncated, l.request_body_binary, l.response_status, l.response_headers_json,
			l.response_body_preview, l.response_body_size, l.response_content_type, l.response_body_truncated,
			l.response_body_binary, l.duration_ms, l.error_message, l.client_ip, l.user_agent, l.created_at
		FROM traffic_logs l
		INNER JOIN projects p ON p.id = l.project_id
		WHERE l.id = ?
		LIMIT 1
	`, id)

	return scanTrafficLog(row)
}

func (store *Store) ListTrafficLogs(ctx context.Context, filters LogFilters) ([]models.TrafficLogRecord, string, error) {
	limit := filters.Limit
	if limit <= 0 {
		limit = 50
	}

	conditions := []string{"1 = 1"}
	args := make([]any, 0)

	if filters.ProjectSlug != "" {
		conditions = append(conditions, "p.slug = ?")
		args = append(args, filters.ProjectSlug)
	}

	if filters.Method != "" {
		conditions = append(conditions, "l.method = ?")
		args = append(args, strings.ToUpper(filters.Method))
	}

	if filters.Status != "" {
		switch filters.Status {
		case "success":
			conditions = append(conditions, "l.error_message = '' AND l.response_status BETWEEN 200 AND 399")
		case "error":
			conditions = append(conditions, "(l.error_message != '' OR l.response_status >= 400)")
		default:
			if code, err := strconv.Atoi(filters.Status); err == nil {
				conditions = append(conditions, "l.response_status = ?")
				args = append(args, code)
			}
		}
	}

	if filters.Search != "" {
		search := "%" + strings.ToLower(strings.TrimSpace(filters.Search)) + "%"
		conditions = append(conditions, `(LOWER(l.path) LIKE ? OR LOWER(l.full_url) LIKE ? OR LOWER(l.request_body_preview) LIKE ? OR LOWER(l.response_body_preview) LIKE ? OR LOWER(l.error_message) LIKE ?)`)
		args = append(args, search, search, search, search, search)
	}

	if filters.Cursor != "" {
		conditions = append(conditions, "l.id < ?")
		args = append(args, filters.Cursor)
	}

	query := fmt.Sprintf(`
		SELECT
			l.id, p.id, p.name, p.slug, l.method, l.path, l.full_url, l.query_json,
			l.request_headers_json, l.request_files_json, l.request_body_preview, l.request_body_size, l.request_content_type,
			l.request_body_truncated, l.request_body_binary, l.response_status, l.response_headers_json,
			l.response_body_preview, l.response_body_size, l.response_content_type, l.response_body_truncated,
			l.response_body_binary, l.duration_ms, l.error_message, l.client_ip, l.user_agent, l.created_at
		FROM traffic_logs l
		INNER JOIN projects p ON p.id = l.project_id
		WHERE %s
		ORDER BY l.id DESC
		LIMIT ?
	`, strings.Join(conditions, " AND "))

	args = append(args, limit+1)
	rows, err := store.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	records := make([]models.TrafficLogRecord, 0, limit)
	nextCursor := ""
	for rows.Next() {
		record, err := scanTrafficLog(rows)
		if err != nil {
			return nil, "", err
		}

		if len(records) == limit {
			nextCursor = record.ID
			break
		}
		records = append(records, record)
	}

	return records, nextCursor, rows.Err()
}

func (store *Store) GetStats(ctx context.Context, projectSlug string) (models.StatsResponse, error) {
	stats := models.StatsResponse{
		RecentFailures: make([]models.TrafficLogSummary, 0),
	}

	row := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE is_active = 1`)
	if err := row.Scan(&stats.ActiveProjects); err != nil {
		return stats, err
	}

	where := "1 = 1"
	args := make([]any, 0)
	if projectSlug != "" {
		where = "p.slug = ?"
		args = append(args, projectSlug)
	}

	row = store.db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT
			COUNT(*) AS total_requests,
			COALESCE(SUM(CASE WHEN l.error_message = '' AND l.response_status BETWEEN 200 AND 399 THEN 1 ELSE 0 END), 0) AS success_count,
			COALESCE(SUM(CASE WHEN l.error_message != '' OR l.response_status >= 400 THEN 1 ELSE 0 END), 0) AS error_count,
			COALESCE(AVG(l.duration_ms), 0),
			MAX(l.created_at)
		FROM traffic_logs l
		INNER JOIN projects p ON p.id = l.project_id
		WHERE %s
	`, where), args...)

	var lastTraffic sql.NullString
	if err := row.Scan(&stats.TotalRequests, &stats.SuccessCount, &stats.ErrorCount, &stats.AverageLatency, &lastTraffic); err != nil {
		return stats, err
	}

	if lastTraffic.Valid && lastTraffic.String != "" {
		parsed, err := time.Parse(time.RFC3339Nano, lastTraffic.String)
		if err == nil {
			stats.LastTrafficAt = &parsed
		}
	}

	rows, err := store.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT
			l.id, p.id, p.name, p.slug, l.method, l.path, l.full_url, l.query_json,
			l.request_headers_json, l.request_files_json, l.request_body_preview, l.request_body_size, l.request_content_type,
			l.request_body_truncated, l.request_body_binary, l.response_status, l.response_headers_json,
			l.response_body_preview, l.response_body_size, l.response_content_type, l.response_body_truncated,
			l.response_body_binary, l.duration_ms, l.error_message, l.client_ip, l.user_agent, l.created_at
		FROM traffic_logs l
		INNER JOIN projects p ON p.id = l.project_id
		WHERE %s AND (l.error_message != '' OR l.response_status >= 400)
		ORDER BY l.id DESC
		LIMIT 5
	`, where), args...)
	if err != nil {
		return stats, err
	}
	defer rows.Close()

	for rows.Next() {
		record, err := scanTrafficLog(rows)
		if err != nil {
			return stats, err
		}
		stats.RecentFailures = append(stats.RecentFailures, record.Summary())
	}

	return stats, rows.Err()
}

func (store *Store) DeleteTrafficLog(ctx context.Context, id string) error {
	result, err := store.db.ExecContext(ctx, `DELETE FROM traffic_logs WHERE id = ?`, id)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return sql.ErrNoRows
	}

	return nil
}

func (store *Store) ListStoredFilePathsByLog(ctx context.Context, id string) ([]string, error) {
	return store.listStoredFilePaths(ctx, `SELECT request_files_json FROM traffic_logs WHERE id = ?`, id)
}

func (store *Store) ListStoredFilePathsByProject(ctx context.Context, slug string) ([]string, error) {
	return store.listStoredFilePaths(ctx, `
		SELECT l.request_files_json
		FROM traffic_logs l
		INNER JOIN projects p ON p.id = l.project_id
		WHERE p.slug = ?
	`, slug)
}

func (store *Store) ListStoredFilePaths(ctx context.Context) ([]string, error) {
	return store.listStoredFilePaths(ctx, `SELECT request_files_json FROM traffic_logs`)
}

func (store *Store) ClearTrafficLogs(ctx context.Context, projectSlug string) (int64, error) {
	query := `DELETE FROM traffic_logs`
	args := make([]any, 0)

	if strings.TrimSpace(projectSlug) != "" {
		query = `
			DELETE FROM traffic_logs
			WHERE project_id IN (
				SELECT id FROM projects WHERE slug = ?
			)
		`
		args = append(args, strings.TrimSpace(projectSlug))
	}

	result, err := store.db.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}

	return result.RowsAffected()
}

func (store *Store) listStoredFilePaths(ctx context.Context, query string, args ...any) ([]string, error) {
	rows, err := store.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	filePaths := make([]string, 0)
	for rows.Next() {
		var payload string
		if err := rows.Scan(&payload); err != nil {
			return nil, err
		}

		if strings.TrimSpace(payload) == "" {
			continue
		}

		var files []models.UploadedFile
		if err := json.Unmarshal([]byte(payload), &files); err != nil {
			continue
		}

		for _, file := range files {
			if strings.TrimSpace(file.SavedPath) != "" {
				filePaths = append(filePaths, file.SavedPath)
			}
		}
	}

	return filePaths, rows.Err()
}

func scanProject(scanner interface {
	Scan(dest ...any) error
}) (models.Project, error) {
	var project models.Project
	var isActive int
	var createdAt string
	var updatedAt string

	err := scanner.Scan(&project.ID, &project.Name, &project.Slug, &project.BaseURL, &isActive, &createdAt, &updatedAt)
	if err != nil {
		return models.Project{}, err
	}

	project.IsActive = isActive == 1
	project.CreatedAt, err = time.Parse(time.RFC3339Nano, createdAt)
	if err != nil {
		return models.Project{}, err
	}
	project.UpdatedAt, err = time.Parse(time.RFC3339Nano, updatedAt)
	if err != nil {
		return models.Project{}, err
	}
	return project, nil
}

func scanTrafficLog(scanner interface {
	Scan(dest ...any) error
}) (models.TrafficLogRecord, error) {
	var record models.TrafficLogRecord
	var createdAt string
	var requestBodyTruncated int
	var requestBodyBinary int
	var responseBodyTruncated int
	var responseBodyBinary int

	err := scanner.Scan(
		&record.ID, &record.ProjectID, &record.ProjectName, &record.ProjectSlug, &record.Method, &record.Path, &record.FullURL, &record.QueryJSON,
		&record.RequestHeadersJSON, &record.RequestFilesJSON, &record.RequestBodyPreview, &record.RequestBodySize, &record.RequestContentType,
		&requestBodyTruncated, &requestBodyBinary, &record.ResponseStatus, &record.ResponseHeadersJSON,
		&record.ResponseBodyPreview, &record.ResponseBodySize, &record.ResponseContentType, &responseBodyTruncated,
		&responseBodyBinary, &record.DurationMS, &record.ErrorMessage, &record.ClientIP, &record.UserAgent, &createdAt,
	)
	if err != nil {
		return models.TrafficLogRecord{}, err
	}

	record.RequestBodyTruncated = requestBodyTruncated == 1
	record.RequestBodyBinary = requestBodyBinary == 1
	record.ResponseBodyTruncated = responseBodyTruncated == 1
	record.ResponseBodyBinary = responseBodyBinary == 1
	record.CreatedAt, err = time.Parse(time.RFC3339Nano, createdAt)
	if err != nil {
		return models.TrafficLogRecord{}, err
	}

	return record, nil
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
