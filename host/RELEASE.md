# Release + Integrity Workflow

This host enforces signed releases by default. Bots must run a signed binary
that matches the release manifest.

## Build a binary (pkg)
```
cd /Users/user/Desktop/molt/host
npm run build:pkg
```
Outputs:
- `releases/moltbot-host` (platform-specific)

## Create a release template
```
node release/build-release.js releases/moltbot-host moltbot-host 0.1.0
```
This writes `release.json` with a SHA-256 of the binary.

## Upload binary to IPFS
- Upload `releases/moltbot-host` and note the CID.
- Add `cid` to `release.json`:
  - `"cid": "<IPFS_CID>"`

## Publish public UI to IPFS
- Upload `public/index.html` to IPFS and note the CID.
- Add `uiCid` to `release.json`:
  ```bash
  npm run release:ui -- <UI_CID>
  ```

## Sign the release
```
export RELEASE_SIGNING_KEY_BASE64="<ed25519 private key>"
node release/sign-release.js release.json
```
Outputs `release.signed.json` with `sig`.

## Publish the signed release to XRPL
```
export RELEASE_PUBLISHER_SEED="<publisher seed>"
node release/publish-release.js release.signed.json config.json
```

## Distribute + enforce
- Bots download releases via `node src/update.js` or auto-update.
- The signed manifest is written to `releases/latest.json`.
- On startup, the host verifies:
  - release signature
  - executable hash matches release.sha256

## Promote pending releases
Auto-update downloads to `releases/pending.json`. To promote:
```
node release/promote-release.js
```

## Dev bypass (optional)
If you must run from source:
- Set `release.allowUnsignedDev: true` in config.
This is disabled by default.

## systemd (production automation)
For bots that only receive the binary + config, install these:
- `dist/moltbot-ipfs.service`
- `dist/moltbot-host.service`
- `dist/moltbot-prestart.sh`
- `dist/moltbot-ipfs-prestart.sh`
- `dist/moltbot.env.example`
- `tee/gramine/generate-attestation.sh`
- `tee/gramine/verify-attestation.sh`
- `tee/gramine/get-storage-kek.sh`
- `tee/gramine/provision-tpm-kek.sh`

Suggested layout:
```
/opt/moltbot/moltbot-host
/opt/moltbot/config.json
/opt/moltbot/releases/latest.json
```

Install:
```
sudo cp dist/moltbot-ipfs.service /etc/systemd/system/
sudo cp dist/moltbot-host.service /etc/systemd/system/
sudo install -d -m 0755 /usr/local/lib/moltbot
sudo cp dist/moltbot-prestart.sh /usr/local/lib/moltbot/moltbot-prestart.sh
sudo cp dist/moltbot-ipfs-prestart.sh /usr/local/lib/moltbot/moltbot-ipfs-prestart.sh
sudo chmod 0755 /usr/local/lib/moltbot/moltbot-prestart.sh /usr/local/lib/moltbot/moltbot-ipfs-prestart.sh
sudo install -d -m 0755 /opt/moltbot/tee/gramine
sudo cp tee/gramine/generate-attestation.sh /opt/moltbot/tee/gramine/generate-attestation.sh
sudo cp tee/gramine/verify-attestation.sh /opt/moltbot/tee/gramine/verify-attestation.sh
sudo cp tee/gramine/get-storage-kek.sh /opt/moltbot/tee/gramine/get-storage-kek.sh
sudo cp tee/gramine/provision-tpm-kek.sh /opt/moltbot/tee/gramine/provision-tpm-kek.sh
sudo chmod 0755 /opt/moltbot/tee/gramine/generate-attestation.sh /opt/moltbot/tee/gramine/verify-attestation.sh /opt/moltbot/tee/gramine/get-storage-kek.sh /opt/moltbot/tee/gramine/provision-tpm-kek.sh
sudo install -d -m 0750 /etc/moltbot
sudo cp dist/moltbot.env.example /etc/moltbot/moltbot.env
sudo chgrp moltbot /etc/moltbot/moltbot.env
sudo chmod 0640 /etc/moltbot/moltbot.env
sudo /opt/moltbot/tee/gramine/provision-tpm-kek.sh --handle 0x81010020 --env-file /etc/moltbot/moltbot.env
sudo systemctl daemon-reload
sudo systemctl enable --now moltbot-ipfs moltbot-host
```

Fleet rollout from a control machine:
```bash
cd /path/to/molt
scripts/rollout/provision-tpm-kek-fleet.sh \
  --hosts-file scripts/rollout/hosts.example \
  --ssh-user ubuntu \
  --handle 0x81010020
```
This installs TPM KEK scripts remotely, provisions per-host KEKs, updates `/etc/moltbot/moltbot.env`, and restarts services with health checks.

`moltbot-prestart.sh` enforces production prerequisites:
- `NODE_ENV=production`
- command-based KEK retrieval (no plaintext `MOLT_ENCRYPTION_STORAGE_KEK`)
- attestation verifier present
- attestation evidence generated when SGX attestation device is available
