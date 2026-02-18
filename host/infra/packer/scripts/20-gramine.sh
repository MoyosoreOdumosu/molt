#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
codename="$(lsb_release -sc)"
gramine_repo="https://packages.gramineproject.io/"
gramine_keyring="/etc/apt/keyrings/gramine.gpg"

sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL "${gramine_repo}/gramine-keyring.gpg" | sudo tee "${gramine_keyring}" >/dev/null
sudo chmod 0644 "${gramine_keyring}"
echo "deb [arch=amd64 signed-by=${gramine_keyring}] ${gramine_repo} ${codename} main" \
  | sudo tee /etc/apt/sources.list.d/gramine.list >/dev/null

sudo apt-get update
if ! apt-cache show gramine >/dev/null 2>&1; then
  echo "Gramine package index is unavailable for codename '${codename}' from ${gramine_repo}" >&2
  exit 1
fi
sudo apt-get install -y --no-install-recommends gramine
