---
name: Zebvix Go service setup
description: How the Go matching engine is configured in Replit and on VPS
---

## Replit environment
- Install Go via module: `installProgrammingLanguage({ language: "go-1.25" })`
- Go binary is NOT in PATH by default after install until next shell — workflows pick it up automatically
- Workflow command MUST set env vars explicitly: `PORT=23004 BASE_PATH=/go-service/ go run .`
  - Without `PORT=23004`, the service defaults to 8090 and the workflow port-wait fails
- Workflow type: `console` (not `webview`) — no browser preview needed
- artifact.toml at `artifacts/go-service/.replit-artifact/artifact.toml`

**Why:** `main.go` reads `os.Getenv("PORT")` and falls back to 8090 — Replit workflow env injection does NOT pass `PORT` from artifact.toml's `[services.env]` section at dev run time.

## VPS production
- Build: `go build -o server -ldflags="-s -w" .` inside `artifacts/go-service/`
- Runs on port 23004 via PM2 (`cryptox-go` process in `deploy/pm2.config.cjs`)
- Go binary path in PM2: `${APP_DIR}/artifacts/go-service/server`
- Internal RPC protected by `INTERNAL_SECRET` env var + 127.0.0.1 bind (`BIND_ADDR=127.0.0.1` in PM2 env)
