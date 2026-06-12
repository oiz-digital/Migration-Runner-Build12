#!/usr/bin/env bash
# Zebvix VPS Deploy Script
# Usage: sudo bash deploy.sh
set -e

PROJECT="/opt/cryptox"
PM2_HOME="$PROJECT/.pm2"

echo "==> Pulling latest from GitHub..."
cd "$PROJECT"
git pull origin main

echo "==> Fixing permissions..."
sudo chown -R ubuntu:ubuntu /opt/cryptox/artifacts /opt/cryptox/lib /opt/cryptox/node_modules 2>/dev/null || true

echo "==> Installing dependencies..."
pnpm install --no-frozen-lockfile

echo "==> Building API server..."
pnpm --filter @workspace/api-server run build

echo "==> Building Admin panel..."
PORT=3001 BASE_PATH=/admin/ pnpm --filter @workspace/admin run build

echo "==> Building User portal..."
PORT=3002 BASE_PATH=/user/ pnpm --filter @workspace/user-portal run build

echo "==> Pushing DB schema (if changed)..."
sudo HOME=/root DATABASE_URL="postgresql://zebvix:Tyagi00%40123@localhost:5432/zebvixdb" \
  NODE_ENV=development pnpm --filter @workspace/db run push || true

echo "==> Copying build output to nginx serve paths..."
sudo mkdir -p /opt/cryptox/dist/user /opt/cryptox/dist/admin
sudo rsync -a --delete /opt/cryptox/artifacts/user-portal/dist/public/ /opt/cryptox/dist/user/
sudo rsync -a --delete /opt/cryptox/artifacts/admin/dist/public/ /opt/cryptox/dist/admin/

echo "==> Restarting PM2 processes..."
sudo PM2_HOME="$PM2_HOME" pm2 restart all

echo ""
echo "✅ Deploy complete!"
sudo PM2_HOME="$PM2_HOME" pm2 list
