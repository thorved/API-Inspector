FROM oven/bun:1 AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile

COPY frontend/ ./
RUN bun run build

FROM golang:1.25 AS backend-builder
WORKDIR /app/backend

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
COPY --from=frontend-builder /app/frontend/out ./web/dist

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /api-inspector ./cmd/server

FROM debian:bookworm-slim
WORKDIR /app

RUN useradd --system --create-home api-inspector

COPY --from=backend-builder /api-inspector /app/api-inspector

RUN mkdir -p /app/data && chown -R api-inspector:api-inspector /app

USER api-inspector

ENV API_INSPECTOR_ADDR=:8080
EXPOSE 8080

CMD ["/app/api-inspector"]
