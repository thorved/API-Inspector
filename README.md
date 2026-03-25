# API-Inspector

API-Inspector is a monorepo MVP for proxying API traffic through a Go service, storing request and response history in SQLite, and inspecting the captured exchange in a static Next.js dashboard.

## Stack

- Backend: Go, Gin, SQLite via `modernc.org/sqlite`, SSE, Zap
- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS 4
- Dev loop: `air` for Go hot reload, `bun dev` for the frontend

## Repo Layout

- `backend/`: Go API, proxy engine, SQLite storage, SSE, embedded frontend serving
- `frontend/`: Static-exported dashboard UI

## Local Development

### 1. Start the backend

From [backend](/E:/github/thorved/API-Inspector/backend):

```powershell
go install github.com/air-verse/air@latest
$env:API_INSPECTOR_FRONTEND_DEV_URL="http://localhost:3000"
air -c .air.toml
```

The backend listens on `http://localhost:8080` by default.

### 2. Start the frontend

From [frontend](/E:/github/thorved/API-Inspector/frontend):

```powershell
$env:NEXT_PUBLIC_API_BASE_URL="http://localhost:8080"
bun dev
```

Open `http://localhost:3000`.

This is the intended hot-reload workflow for development:

- backend: `air -c .air.toml`
- frontend: `bun dev`

The frontend talks to the Go API directly through `NEXT_PUBLIC_API_BASE_URL`, so you do not need any extra sync step while developing.

## Release Build

### Windows executable

From the repo root:

```powershell
.\build-release.ps1
```

That will:

- build the static frontend
- copy it into [backend/web/dist](/E:/github/thorved/API-Inspector/backend/web/dist)
- compile `dist/api-inspector.exe`

### Docker

```powershell
docker compose build
docker compose up
```

This builds the frontend and backend together in the container image and persists SQLite data in a Docker volume.

## Main Routes

- `ANY /proxy/:slug/*path`: forwards traffic to the project base URL
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:slug`
- `GET /api/logs`
- `GET /api/logs/:id`
- `GET /api/stats`
- `GET /api/events/traffic`

## Notes

- All captured headers are stored and returned exactly as received, including `Authorization`, `Cookie`, `Set-Cookie`, API keys, and token/password-style names.
- Text payloads are stored in full by default. Set `API_INSPECTOR_BODY_PREVIEW_LIMIT` to a positive byte limit if you want truncation instead.
- Binary payloads are detected and omitted from inline previews.
- The MVP currently has no user auth, retries, workspaces, or replay support.
- During development, the Go app serves APIs while Next serves the UI separately for fast hot reload.
- During release builds, the frontend is copied into the backend embed directory so the Go binary or Docker image serves everything from one process.
