#!/usr/bin/env bash
set -euo pipefail

sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates gnupg lsb-release
