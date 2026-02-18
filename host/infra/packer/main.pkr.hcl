packer {
  required_plugins {
    qemu = {
      version = ">= 1.0.0"
      source  = "github.com/hashicorp/qemu"
    }
  }
}

source "qemu" "ubuntu" {
  iso_url           = var.ubuntu_iso_url
  iso_checksum      = var.ubuntu_iso_checksum
  output_directory  = "output/moltbot-ubuntu-${var.ubuntu_version}"
  accelerator       = var.accelerator
  memory            = 2048
  cpus              = 2
  disk_size         = "20000"
  format            = "qcow2"
  headless          = true
  # macOS 11 (Big Sur): VM and VNC are slower; use longer waits and slower key interval
  boot_wait         = "90s"
  ssh_username      = "ubuntu"
  ssh_private_key_file = "packer_ssh_ed25519"
  # Fallback when key injection fails/times out in installer; password is set in user-data late-commands.
  ssh_password      = var.ssh_password
  ssh_timeout       = "45m"
  ssh_handshake_attempts = 200
  vnc_bind_address  = "127.0.0.1"
  vnc_port_min      = 5900
  vnc_port_max      = 6000
  # Leave vnc_password unset so Packer's VNC handshake doesn't EOF.

  http_directory    = "http"
  http_port_min     = 8000
  http_port_max     = 8099
  http_bind_address = "0.0.0.0"
  boot_key_interval = "500ms"
  qemuargs = [
    ["-serial", "file:serial.log"],
    ["-display", var.qemu_display]
  ]

  # GRUB command-line boot: no menu editing, so no dependency on down/end timing.
  # More reliable on macOS 11 where VNC key injection can drop keys or be slow.
  # 1) Press 'c' for GRUB command line, wait for prompt
  # 2) linux /casper/vmlinuz ... (noapic + autoinstall + nocloud)
  # 3) initrd /casper/initrd, boot
  # 4) Send Enter at 3–7 min to dismiss "Installer update available" whenever it appears
  boot_command = [
    "c<wait10s>",
    "linux /casper/vmlinuz noapic autoinstall ds=nocloud-net\\;s=http://10.0.2.2:{{ .HTTPPort }}/ ip=dhcp console=ttyS0,115200n8 ---<enter>",
    "initrd /casper/initrd<enter>",
    "boot<enter>",
    "<wait180s><enter><wait60s><enter><wait60s><enter><wait60s><enter><wait60s><enter>"
  ]
}

build {
  sources = ["source.qemu.ubuntu"]

  provisioner "shell" {
    environment_vars = [
      "INSTALL_DIR=${var.install_dir}",
      "MOLTBOT_USER=${var.moltbot_user}"
    ]
    scripts = [
      "scripts/00-base.sh",
      "scripts/10-sgx-dcap.sh",
      "scripts/20-gramine.sh",
      "scripts/30-ipfs.sh",
      "scripts/40-moltbot.sh"
    ]
  }

  provisioner "file" {
    source      = var.moltbot_binary
    destination = "/tmp/moltbot-host"
  }

  provisioner "file" {
    source      = var.moltbot_config
    destination = "/tmp/config.json"
  }

  provisioner "file" {
    source      = var.release_manifest
    destination = "/tmp/latest.json"
  }

  provisioner "file" {
    source      = "../../dist/moltbot-ipfs.service"
    destination = "/tmp/moltbot-ipfs.service"
  }

  provisioner "file" {
    source      = "../../dist/moltbot-host.service"
    destination = "/tmp/moltbot-host.service"
  }
}
