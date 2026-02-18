# Packer build: storage blocker (macOS)

## Current state

The build **stops at "Guided storage configuration"** in Subiquity on **macOS**. Packer cannot proceed because the installer waits for a manual click.

We have tried:

- `storage.layout` with `name: lvm` and `name: direct` (with and without `match`)
- Full action-based `storage.config` (GPT, bios_grub, root, grub_device, wipe superblock-recursive, swap: 0)
- Streaming Subiquity/curtin logs to serial
- **Minimal test:** `storage: layout: name: direct` only → **still stuck.** Subiquity does not apply any storage config on this host.

**Conclusion:** Subiquity on macOS 11 + QEMU + Ubuntu 22.04.5 live server ISO ignores the autoinstall storage section and always falls back to the guided screen. Do not keep changing user-data on macOS for storage.

## Use this instead: build on Ubuntu

**Recommended:** Run Packer on an Ubuntu host so Subiquity applies storage. No changes to user-data needed.

### Option A: GitHub Actions (no local Ubuntu)

1. Push the repo to GitHub.
2. In the repo: **Actions** → **Packer image (Ubuntu)** → **Run workflow**.
3. When the job finishes, download the **moltbot-ubuntu-22.04** artifact (contains the qcow2 image).

Workflow file: **`.github/workflows/packer-image.yml`**. It uses `config.a.test.json` for the build; for production you’d use a real `config.json` or a secret.

Important for CI SSH reliability:

- Run `infra/packer/prepare-autoinstall-ssh.sh` before `packer build` so `http/user-data` `authorized-keys` matches `packer_ssh_ed25519.pub`.
- Upload `packer-debug.log`, `packer-build.log`, and `serial.log` as artifacts even on failure.

### Option B: Local Ubuntu (or Ubuntu VM / Docker)

On a machine with Ubuntu and QEMU (and KVM if possible):

```bash
cd host
npm ci && npm run build:pkg:linux && npm run image:prepare
cd infra/packer && ./build.sh
```

### Other alternatives

- **Ubuntu cloud image:** Change the Packer template to boot from an Ubuntu cloud image instead of the live server ISO (no Subiquity, no guided storage). More work.
- **Manual install once:** Do one manual Ubuntu install in QEMU, then use that disk as a base and run only provisioners.

## Files

- `http/user-data` – autoinstall (currently minimal storage test)
- `main.pkr.hcl` – QEMU/Packer config
- `serial.log` – serial console output (if early-commands were re-enabled, Subiquity/curtin logs would appear here)
