#!/bin/bash
# Deploy AutoPRD.id ke VPS (dijalankan dari lokal via vps-ssh, atau langsung di VPS).
# Penggunaan: ./deploy.sh
set -euo pipefail

APP_DIR=/opt/autoprd
SERVICE=autoprd.service

echo "== Backup =="
if [ -d "$APP_DIR/data" ]; then
  cp -a "$APP_DIR/data" "/tmp/autoprd-data-bak-$(date +%Y%m%d-%H%M%S)"
  echo "data dibackup ke /tmp"
fi

echo "== Sync file =="
rsync -a --delete --exclude '.env' --exclude 'data/' --exclude 'queue/' --exclude 'node_modules/' \
  ./ "$APP_DIR/"

echo "== Dependencies =="
cd "$APP_DIR"
npm install --omit=dev --no-audit --no-fund

echo "== Permission & restart =="
chown -R ubuntu:ubuntu "$APP_DIR"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE"
sudo systemctl restart "$SERVICE"
sleep 2
sudo systemctl is-active "$SERVICE"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3001/api/config
echo "== Deploy selesai =="
