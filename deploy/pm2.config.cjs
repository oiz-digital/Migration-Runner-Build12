/**
 * Zebvix — PM2 Ecosystem Config
 * Usage:
 *   pm2 start deploy/pm2.config.cjs
 *   pm2 save
 *   pm2 startup  (auto-start on reboot)
 */

const fs   = require("fs");
const path = require("path");

const APP_DIR = "/opt/cryptox";

// Parse .env file manually — PM2 env_file support is unreliable across versions
function loadEnv(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8")
      .split("\n")
      .reduce((acc, line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return acc;
        const idx = trimmed.indexOf("=");
        if (idx === -1) return acc;
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        acc[key] = val;
        return acc;
      }, {});
  } catch {
    return {};
  }
}

const dotenv = loadEnv(path.join(APP_DIR, ".env"));

module.exports = {
  apps: [
    {
      // ── Node.js API Server ────────────────────────────────────
      name: "cryptox-api",
      script: `${APP_DIR}/artifacts/api-server/dist/index.mjs`,
      interpreter: "node",
      interpreter_args: "--enable-source-maps",
      cwd: APP_DIR,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      restart_delay: 3000,
      env: {
        ...dotenv,
        NODE_ENV: "production",
        PORT: "8080",
      },
      log_file:    "/var/log/cryptox/api.log",
      error_file:  "/var/log/cryptox/api-error.log",
      out_file:    "/var/log/cryptox/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
    {
      // ── Go Order Matching Engine ──────────────────────────────
      name: "cryptox-go",
      script: `${APP_DIR}/artifacts/go-service/server`,
      interpreter: "none",
      cwd: `${APP_DIR}/artifacts/go-service`,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      restart_delay: 2000,
      env: {
        ...dotenv,
        PORT: "23004",
        BASE_PATH: "/go-service/",
        GIN_MODE: "release",
        BIND_ADDR: "127.0.0.1",
      },
      log_file:    "/var/log/cryptox/go.log",
      error_file:  "/var/log/cryptox/go-error.log",
      out_file:    "/var/log/cryptox/go-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
