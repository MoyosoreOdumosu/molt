#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
codename="$(lsb_release -sc)"
intel_sgx_repo="https://download.01.org/intel-sgx/sgx_repo/ubuntu"
intel_sgx_keyring="/etc/apt/keyrings/intel-sgx.gpg"

# Intel SGX + DCAP repo (keyring-based; apt-key is deprecated).
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL "${intel_sgx_repo}/intel-sgx-deb.key" | sudo gpg --dearmor --yes -o "${intel_sgx_keyring}"
echo "deb [arch=amd64 signed-by=${intel_sgx_keyring}] ${intel_sgx_repo} ${codename} main" \
  | sudo tee /etc/apt/sources.list.d/intel-sgx.list >/dev/null

sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  libsgx-dcap-ql \
  libsgx-dcap-quote-verify \
  sgx-aesm-service \
  python3-pip

# Optional: python binding
sudo -H python3 -m pip install --no-cache-dir sgx-dcap-quote-verify-python || true
