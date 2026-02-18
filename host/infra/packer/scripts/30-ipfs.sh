#!/usr/bin/env bash
set -euo pipefail

IPFS_VERSION="v0.26.0"
curl -fsSL "https://dist.ipfs.tech/kubo/${IPFS_VERSION}/kubo_${IPFS_VERSION}_linux-amd64.tar.gz" -o /tmp/kubo.tgz
tar -xzf /tmp/kubo.tgz -C /tmp
sudo /tmp/kubo/install.sh
rm -rf /tmp/kubo /tmp/kubo.tgz
