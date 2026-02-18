#!/usr/bin/env bash
set -euo pipefail

# Final image hardening: disable SSH password auth and lock fallback account password.

if [[ -s /tmp/packer_ssh_ed25519.pub ]] && id ubuntu >/dev/null 2>&1; then
  packer_pubkey="$(tr -d '\r\n' < /tmp/packer_ssh_ed25519.pub)"
  if [[ -n "$packer_pubkey" ]]; then
    sudo install -d -m 0700 -o ubuntu -g ubuntu /home/ubuntu/.ssh
    if ! sudo grep -qxF "$packer_pubkey" /home/ubuntu/.ssh/authorized_keys 2>/dev/null; then
      printf '%s\n' "$packer_pubkey" | sudo tee -a /home/ubuntu/.ssh/authorized_keys >/dev/null
    fi
    sudo chown ubuntu:ubuntu /home/ubuntu/.ssh/authorized_keys
    sudo chmod 0600 /home/ubuntu/.ssh/authorized_keys
  fi
fi

if id ubuntu >/dev/null 2>&1 && ! sudo test -s /home/ubuntu/.ssh/authorized_keys; then
  echo "ubuntu authorized_keys is missing or empty; refusing to disable SSH password auth." >&2
  exit 1
fi

if [[ -x /usr/sbin/sshd ]]; then
  SSHD_BIN="/usr/sbin/sshd"
elif command -v sshd >/dev/null 2>&1; then
  SSHD_BIN="$(command -v sshd)"
else
  echo "sshd binary not found for config validation" >&2
  exit 1
fi

sudo install -d -m 0755 /etc/ssh/sshd_config.d
cat <<'SSH_HARDEN' | sudo tee /etc/ssh/sshd_config.d/99-moltbot-hardening.conf >/dev/null
# Managed by Packer: enforce key-based SSH only in shipped image.
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
PermitRootLogin no
UsePAM yes
SSH_HARDEN
sudo chmod 0644 /etc/ssh/sshd_config.d/99-moltbot-hardening.conf

# Prevent cloud-init from re-enabling SSH password auth at first boot.
sudo install -d -m 0755 /etc/cloud/cloud.cfg.d
cat <<'CLOUD_HARDEN' | sudo tee /etc/cloud/cloud.cfg.d/99-moltbot-ssh-hardening.cfg >/dev/null
ssh_pwauth: false
disable_root: true
CLOUD_HARDEN
sudo chmod 0644 /etc/cloud/cloud.cfg.d/99-moltbot-ssh-hardening.cfg

sudo "$SSHD_BIN" -t -f /etc/ssh/sshd_config

if id ubuntu >/dev/null 2>&1; then
  sudo passwd -l ubuntu >/dev/null
  account_state="$(sudo passwd -S ubuntu | awk '{print $2}')"
  if [[ "$account_state" != "L" && "$account_state" != "LK" ]]; then
    echo "failed to lock ubuntu password; passwd state=$account_state" >&2
    exit 1
  fi
fi

if ! sudo "$SSHD_BIN" -T -f /etc/ssh/sshd_config | grep -q '^passwordauthentication no$'; then
  echo "effective sshd config does not enforce PasswordAuthentication no" >&2
  exit 1
fi
