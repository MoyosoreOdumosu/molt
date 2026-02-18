# Packer build: legacy ISO blocker (resolved)

## Status

This repository previously used Ubuntu live-server ISO + VNC boot command typing.
That path was fragile and could hang (Subiquity screens, VNC key injection timing, no KVM in CI).

As of February 18, 2026, the active template now boots directly from the Ubuntu cloud image (`disk_image=true`) with NoCloud seed data:

- `cloud-init/user-data` (SSH key and base cloud-init settings)
- `cloud-init/meta-data`
- `main.pkr.hcl` source `qemu.ubuntu` with `cd_label = "cidata"`

No Subiquity installer or VNC key typing is required on the active path.

## Build flow

Use Ubuntu runner/host:

```bash
cd host
npm ci && npm run build:pkg:linux && npm run image:prepare
cd infra/packer && ./build.sh
```

CI run:

1. Push to GitHub.
2. Actions → `Packer image (Ubuntu)` → Run workflow.
3. Download `moltbot-ubuntu-22.04` artifact.

Important:

- Run `infra/packer/prepare-autoinstall-ssh.sh` before `packer build` so `cloud-init/user-data` `ssh_authorized_keys` matches `packer_ssh_ed25519.pub`.
- Upload `packer-debug.log`, `packer-build.log`, and `serial.log` as artifacts on failure.
