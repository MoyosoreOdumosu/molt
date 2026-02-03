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
sudo systemctl daemon-reload
sudo systemctl enable --now moltbot-ipfs moltbot-host
```
