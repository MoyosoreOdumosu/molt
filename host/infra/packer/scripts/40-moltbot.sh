#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/moltbot}"
MOLTBOT_USER="${MOLTBOT_USER:-moltbot}"

sudo useradd -r -s /usr/sbin/nologin "$MOLTBOT_USER" || true
sudo mkdir -p "$INSTALL_DIR/releases" "$INSTALL_DIR/tee/gramine" /etc/moltbot /usr/local/lib/moltbot
sudo chown -R "$MOLTBOT_USER:$MOLTBOT_USER" "$INSTALL_DIR"

sudo install -m 0755 /tmp/moltbot-host "$INSTALL_DIR/moltbot-host"
sudo install -m 0644 /tmp/config.json "$INSTALL_DIR/config.json"
sudo install -m 0644 /tmp/latest.json "$INSTALL_DIR/releases/latest.json"
sudo install -m 0755 /tmp/generate-attestation.sh "$INSTALL_DIR/tee/gramine/generate-attestation.sh"
sudo install -m 0755 /tmp/verify-attestation.sh "$INSTALL_DIR/tee/gramine/verify-attestation.sh"
sudo install -m 0755 /tmp/get-storage-kek.sh "$INSTALL_DIR/tee/gramine/get-storage-kek.sh"
sudo install -m 0755 /tmp/provision-tpm-kek.sh "$INSTALL_DIR/tee/gramine/provision-tpm-kek.sh"
sudo install -m 0755 /tmp/moltbot-prestart.sh /usr/local/lib/moltbot/moltbot-prestart.sh
sudo install -m 0640 -o root -g "$MOLTBOT_USER" /tmp/moltbot.env.example /etc/moltbot/moltbot.env

sudo install -m 0644 /tmp/moltbot-ipfs.service /etc/systemd/system/moltbot-ipfs.service
sudo install -m 0644 /tmp/moltbot-host.service /etc/systemd/system/moltbot-host.service

sudo systemctl daemon-reload
sudo systemctl enable moltbot-ipfs moltbot-host
