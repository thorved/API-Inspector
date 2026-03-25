CREATE TABLE IF NOT EXISTS projects (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	slug TEXT NOT NULL UNIQUE,
	base_url TEXT NOT NULL,
	is_active INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS traffic_logs (
	id TEXT PRIMARY KEY,
	project_id TEXT NOT NULL,
	method TEXT NOT NULL,
	path TEXT NOT NULL,
	full_url TEXT NOT NULL,
	query_json TEXT NOT NULL,
	request_headers_json TEXT NOT NULL,
	request_files_json TEXT NOT NULL DEFAULT '[]',
	request_body_preview TEXT NOT NULL,
	request_body_size INTEGER NOT NULL DEFAULT 0,
	request_content_type TEXT NOT NULL,
	request_body_truncated INTEGER NOT NULL DEFAULT 0,
	request_body_binary INTEGER NOT NULL DEFAULT 0,
	response_status INTEGER NOT NULL DEFAULT 0,
	response_headers_json TEXT NOT NULL,
	response_body_preview TEXT NOT NULL,
	response_body_size INTEGER NOT NULL DEFAULT 0,
	response_content_type TEXT NOT NULL,
	response_body_truncated INTEGER NOT NULL DEFAULT 0,
	response_body_binary INTEGER NOT NULL DEFAULT 0,
	duration_ms INTEGER NOT NULL DEFAULT 0,
	error_message TEXT NOT NULL DEFAULT '',
	client_ip TEXT NOT NULL DEFAULT '',
	user_agent TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_traffic_logs_project_created_at ON traffic_logs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_logs_created_at ON traffic_logs(created_at DESC);
