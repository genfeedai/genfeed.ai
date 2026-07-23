variable "region" {
  type    = string
  default = "us-west-1"
}

variable "project" {
  type    = string
  default = "genfeed"
}

variable "environment" {
  type    = string
  default = "production"
}

# ── Network (genfeedai-vpc; no default VPC in this account) ──────────
variable "vpc_id" {
  type    = string
  default = "vpc-0e7522e453a642bd8" # genfeedai-vpc (10.0.8.0/21)
}

# Existing public subnets (IGW route) — used for the internet-facing ALB + NAT.
variable "public_subnet_ids" {
  type    = list(string)
  default = ["subnet-04dfe8480e85f0a47", "subnet-07aec43af6ded15f0"] # 1b, 1c
}

# NAT lives in this public subnet (1b).
variable "nat_public_subnet_id" {
  type    = string
  default = "subnet-04dfe8480e85f0a47"
}

# New private subnets created by this stack for ECS tasks/instances + cache
# (existing private subnets are 1b-only; we need 2 AZs). CIDRs are free space in
# the VPC (10.0.11/12 .0/24).
variable "private_subnet_cidrs" {
  type = map(string)
  default = {
    "us-west-1b" = "10.0.11.0/24"
    "us-west-1c" = "10.0.12.0/24"
  }
}

# ── DNS / TLS ────────────────────────────────────────────────────────
variable "domain" {
  type    = string
  default = "genfeed.ai"
}

variable "api_subdomain" {
  type    = string
  default = "api"
}

variable "route53_zone_id" {
  type        = string
  default     = ""
  description = "Hosted zone for genfeed.ai. Empty = look up by name (assumes the zone is in Route53)."
}

# DNS cutover gate. FALSE (default): build everything EXCEPT public service
# A-records, so the first apply never repoints live traffic at an empty ALB.
# Push the image, get services healthy, smoke-test the ALB DNS, THEN apply with
# enable_dns_cutover=true to flip api/mcp/notifications hostnames onto the ALB.
#
# ⚠ CI passes -var="enable_dns_cutover=true". The `false` default is a first-run
# safety only — a bare local apply inherits it and would DESTROY the live
# api/mcp/notifications A-records. See the header warning in providers.tf.
variable "enable_dns_cutover" {
  type    = bool
  default = false
}

# ── Capacity ─────────────────────────────────────────────────────────
variable "instance_type" {
  type    = string
  default = "t3a.medium"
}

variable "asg_min" {
  type    = number
  default = 2
}

variable "asg_max" {
  type    = number
  default = 3
}

variable "asg_desired" {
  type    = number
  default = 2
}

# ── Image ────────────────────────────────────────────────────────────
# ⚠ CI passes -var="image_tag=<commit-sha>". The "latest" default is a
# placeholder — a bare local apply inherits it and would replace every task
# definition (a full prod redeploy to :latest). See the header in providers.tf.
variable "image_tag" {
  type        = string
  default     = "latest"
  description = "ECR tag of genfeed/server to deploy (CI passes the commit SHA via -var=\"image_tag=<sha>\")."
}

# ── Secrets ──────────────────────────────────────────────────────────
variable "ssm_path" {
  type        = string
  default     = "/genfeed/production"
  description = "SSM path whose params are injected as task secrets (one env var per param)."
}
