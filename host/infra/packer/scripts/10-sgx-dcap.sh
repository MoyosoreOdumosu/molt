#!/usr/bin/env bash
set -euo pipefail

# Intel SGX + DCAP (Ubuntu 22.04 Jammy)
echo "deb [arch=amd64] https://download.01.org/intel-sgx/sgx_repo/ubuntu jammy main" | sudo tee /etc/apt/sources.list.d/intel-sgx.list
curl -fsSL https://download.01.org/intel-sgx/sgx_repo/ubuntu/intel-sgx-deb.key | sudo apt-key add -
sudo apt-get update
sudo apt-get install -y libsgx-dcap-ql libsgx-dcap-quote-verify sgx-aesm-service

# Optional: python binding
sudo apt-get install -y python3-pip
pip3 install sgx-dcap-quote-verify-python || true
