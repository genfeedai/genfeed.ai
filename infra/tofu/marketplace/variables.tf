variable "region" { type = string }
variable "project" { type = string }
variable "domain" { type = string }
variable "image_digest" {
  type = string
  validation {
    condition     = can(regex("^sha256:[0-9a-f]{64}$", var.image_digest))
    error_message = "Marketplace image must be pinned to an immutable digest."
  }
}
variable "state_bucket" { type = string }
variable "hosted_state_key" { type = string }
variable "ssm_path" {
  type = string
  validation {
    condition     = startswith(var.ssm_path, "/") && !endswith(var.ssm_path, "/")
    error_message = "Use a dedicated absolute SSM path without a trailing slash."
  }
}
variable "database_admin_parameter" {
  type    = string
  default = ""
}
variable "enable_service" {
  type    = bool
  default = false
}
variable "enable_dns_cutover" {
  type    = bool
  default = false
}
