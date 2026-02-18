#!/usr/bin/env bash
set -euo pipefail

sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  apt-transport-https \
  ca-certificates \
  gnupg \
  lsb-release \
  tpm2-tools
