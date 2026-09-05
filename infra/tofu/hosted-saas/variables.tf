variable "region" {
  type        = string
  description = "AWS region for the hosted SaaS stack. Supplied by CI (no account default)."
}

variable "project" {
  type        = string
  description = "Short name used in resource prefixes and the ECR repository (PROJECT/server)."
}

variable "environment" {
  type    = string
  default = "production"
}

# ── Network (existing VPC in the caller's account) ───────────────────
variable "vpc_id" {
  type        = string
  description = "Existing VPC to attach the ALB, NAT, and private subnets to."
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "Existing public subnets (IGW route) for the internet-facing ALB and NAT."
}

variable "nat_public_subnet_id" {
  type        = string
  description = "Public subnet that hosts the NAT gateway."
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
  type        = string
  description = "Apex domain for public service hostnames (api/mcp/notifications.<domain>)."
}

variable "api_subdomain" {
  type    = string
  default = "api"
}

variable "route53_zone_id" {
  type        = string
  default     = ""
  description = "Route53 hosted zone id. Empty = look up the zone named var.domain."
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

variable "redis_auth_token_update_strategy" {
  type        = string
  default     = "SET"
  description = "ElastiCache AUTH token strategy. SET replaces an existing token. ROTATE is required to add the first token on a cluster that has never had AUTH."

  validation {
    condition     = contains(["SET", "ROTATE"], var.redis_auth_token_update_strategy)
    error_message = "redis_auth_token_update_strategy must be SET or ROTATE."
  }
}

# ── Secrets ──────────────────────────────────────────────────────────
variable "ssm_path" {
  type        = string
  description = "SSM path whose params are injected as task secrets (one env var per param)."
}

variable "rds_instance_id" {
  type        = string
  description = "Existing RDS instance identifier to snapshot before migrations."
}

variable "owner_email" {
  type        = string
  description = "Platform owner email passed to the articles-seed one-off task."
}

variable "organization_label" {
  type        = string
  description = "Organization label passed to the articles-seed one-off task."
}

variable "cdn_bucket" {
  type        = string
  description = "S3 bucket name the task role may read/write for published media."
}

variable "image_digest" {
  description = "Verified ECR manifest digest required for every infrastructure plan and apply."
  type        = string
  validation {
    condition     = can(regex("^sha256:[0-9a-f]{64}$", var.image_digest))
    error_message = "image_digest must be an immutable SHA-256 digest."
  }
}
