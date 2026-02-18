packer {
  required_plugins {
    qemu = {
      version = ">= 1.0.0"
      source  = "github.com/hashicorp/qemu"
    }
  }
}

source "qemu" "ubuntu" {
  iso_url           = var.ubuntu_cloud_image_url
  iso_checksum      = var.ubuntu_cloud_image_checksum
  disk_image        = true
  output_directory  = "output/moltbot-ubuntu-${var.ubuntu_version}"
  accelerator       = var.accelerator
  memory            = 2048
  cpus              = 2
  disk_size         = "20000"
  format            = "qcow2"
  headless          = true
  # Cloud image boots directly (no ISO installer / VNC key injection).
  boot_wait         = "5s"
  ssh_username      = "ubuntu"
  ssh_private_key_file = "packer_ssh_ed25519"
  ssh_password      = var.ssh_password
  ssh_timeout       = var.ssh_timeout
  ssh_handshake_attempts = var.ssh_handshake_attempts
  shutdown_command  = "sudo shutdown -P now"
  cd_files          = [
    "cloud-init/user-data",
    "cloud-init/meta-data"
  ]
  cd_label          = "CIDATA"
  qemuargs = [
    ["-serial", "file:serial.log"],
    ["-display", var.qemu_display]
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
      "scripts/30-ipfs.sh"
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

  provisioner "file" {
    source      = "../../dist/moltbot-prestart.sh"
    destination = "/tmp/moltbot-prestart.sh"
  }

  provisioner "file" {
    source      = "../../dist/moltbot.env.example"
    destination = "/tmp/moltbot.env.example"
  }

  provisioner "file" {
    source      = "../../tee/gramine/generate-attestation.sh"
    destination = "/tmp/generate-attestation.sh"
  }

  provisioner "file" {
    source      = "../../tee/gramine/verify-attestation.sh"
    destination = "/tmp/verify-attestation.sh"
  }

  provisioner "file" {
    source      = "../../tee/gramine/get-storage-kek.sh"
    destination = "/tmp/get-storage-kek.sh"
  }

  provisioner "file" {
    source      = "../../tee/gramine/provision-tpm-kek.sh"
    destination = "/tmp/provision-tpm-kek.sh"
  }

  provisioner "file" {
    source      = "packer_ssh_ed25519.pub"
    destination = "/tmp/packer_ssh_ed25519.pub"
  }

  provisioner "shell" {
    environment_vars = [
      "INSTALL_DIR=${var.install_dir}",
      "MOLTBOT_USER=${var.moltbot_user}"
    ]
    scripts = [
      "scripts/40-moltbot.sh"
    ]
  }

  provisioner "shell" {
    scripts = [
      "scripts/50-ssh-hardening.sh"
    ]
  }
}
