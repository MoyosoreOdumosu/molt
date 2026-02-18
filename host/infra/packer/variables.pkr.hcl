variable "accelerator" {
  type    = string
  default = "hvf"
  # hvf = macOS Hypervisor.framework; kvm = Linux KVM; none = software emulation
}

variable "qemu_display" {
  type    = string
  default = "cocoa"
  # cocoa = macOS; none = Linux headless (CI)
}

variable "ubuntu_version" {
  type    = string
  default = "22.04"
}

variable "ubuntu_cloud_image_url" {
  type    = string
  default = "https://cloud-images.ubuntu.com/releases/jammy/release/ubuntu-22.04-server-cloudimg-amd64.img"
}

variable "ubuntu_cloud_image_checksum" {
  type    = string
  # Verify via upstream checksum manifest.
  default = "file:https://cloud-images.ubuntu.com/releases/jammy/release/SHA256SUMS"
}

variable "moltbot_user" {
  type    = string
  default = "moltbot"
}

variable "install_dir" {
  type    = string
  default = "/opt/moltbot"
}

variable "moltbot_binary" {
  type    = string
  default = "../../releases/moltbot-host"
}

variable "moltbot_config" {
  type    = string
  default = "../../config.json"
}

variable "release_manifest" {
  type    = string
  default = "../../releases/latest.json"
}

variable "ssh_password" {
  type      = string
  default   = "ubuntu"
  sensitive = true
}

variable "ssh_timeout" {
  type    = string
  default = "45m"
}

variable "ssh_handshake_attempts" {
  type    = number
  default = 200
}
