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

set_sshd_option() {
  local key="$1"
  local value="$2"
  local cfg="/etc/ssh/sshd_config"

  # Replace existing declarations (commented or uncommented), case-insensitive.
  sudo sed -ri "s|^[[:space:]]*#?[[:space:]]*${key}[[:space:]]+.*$|${key} ${value}|I" "$cfg"
  if ! sudo grep -Eiq "^[[:space:]]*${key}[[:space:]]+${value}[[:space:]]*$" "$cfg"; then
    echo "${key} ${value}" | sudo tee -a "$cfg" >/dev/null
  fi
}

set_sshd_option "PasswordAuthentication" "no"
set_sshd_option "KbdInteractiveAuthentication" "no"
set_sshd_option "ChallengeResponseAuthentication" "no"
set_sshd_option "PubkeyAuthentication" "yes"
set_sshd_option "PermitEmptyPasswords" "no"
set_sshd_option "PermitRootLogin" "no"
set_sshd_option "UsePAM" "yes"

sudo install -d -m 0755 /etc/ssh/sshd_config.d
if sudo test -d /etc/ssh/sshd_config.d; then
  while IFS= read -r conf; do
    sudo sed -ri 's|^[[:space:]]*#?[[:space:]]*PasswordAuthentication[[:space:]]+.*$|PasswordAuthentication no|I' "$conf"
    sudo sed -ri 's|^[[:space:]]*#?[[:space:]]*KbdInteractiveAuthentication[[:space:]]+.*$|KbdInteractiveAuthentication no|I' "$conf"
    sudo sed -ri 's|^[[:space:]]*#?[[:space:]]*ChallengeResponseAuthentication[[:space:]]+.*$|ChallengeResponseAuthentication no|I' "$conf"
  done < <(sudo find /etc/ssh/sshd_config.d -maxdepth 1 -type f -name '*.conf' | sort)
fi

cat <<'SSH_HARDEN' | sudo tee /etc/ssh/sshd_config.d/zzzz-moltbot-hardening.conf >/dev/null
# Managed by Packer: enforce key-based SSH only in shipped image.
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
PermitRootLogin no
UsePAM yes
AuthenticationMethods publickey
SSH_HARDEN
sudo chmod 0644 /etc/ssh/sshd_config.d/zzzz-moltbot-hardening.conf

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

effective_cfg="$(sudo "$SSHD_BIN" -T -f /etc/ssh/sshd_config -C user=ubuntu,host=localhost,addr=127.0.0.1)"
if ! printf '%s\n' "$effective_cfg" | grep -q '^passwordauthentication no$'; then
  echo "effective sshd config does not enforce PasswordAuthentication no" >&2
  printf '%s\n' "$effective_cfg" | grep -E '^(passwordauthentication|kbdinteractiveauthentication|challengeresponseauthentication|pubkeyauthentication|authenticationmethods|permitrootlogin|usepam) ' >&2 || true
  echo "--- /etc/ssh/sshd_config ---" >&2
  sudo sed -n '1,220p' /etc/ssh/sshd_config >&2 || true
  if sudo test -d /etc/ssh/sshd_config.d; then
    for conf in $(sudo find /etc/ssh/sshd_config.d -maxdepth 1 -type f -name '*.conf' | sort); do
      echo "--- ${conf} ---" >&2
      sudo sed -n '1,220p' "$conf" >&2 || true
    done
  fi
  exit 1
fi
