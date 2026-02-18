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

variable "ubuntu_iso_url" {
  type    = string
  default = "https://releases.ubuntu.com/22.04/ubuntu-22.04.5-live-server-amd64.iso"
}

variable "ubuntu_iso_checksum" {
  type    = string
  default = "sha256:9bc6028870aef3f74f4e16b900008179e78b130e6b0b9a140635434a46aa98b0"
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
