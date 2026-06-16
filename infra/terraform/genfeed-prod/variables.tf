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

# ── Network ──────────────────────────────────────────────────────────
# Leave empty to auto-discover the default VPC + its subnets (the box + RDS
# live there today). Override if genfeed runs in a non-default VPC.
variable "vpc_id" {
  type    = string
  default = ""
}

variable "public_subnet_ids" {
  type        = list(string)
  default     = []
  description = "Public subnets for the ALB + ECS container instances. Empty = all subnets in the VPC."
}

variable "private_subnet_ids" {
  type        = list(string)
  default     = []
  description = "Private subnets for ElastiCache. Empty = same as public (default-VPC has only public subnets)."
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

# DNS cutover gate. FALSE (default): build everything EXCEPT the api.genfeed.ai
# A-record, so the first apply never repoints live traffic at an empty ALB. Push
# the image, get services healthy, smoke-test the ALB DNS, THEN apply with
# enable_dns_cutover=true to flip api.genfeed.ai onto the ALB.
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
variable "image_tag" {
  type        = string
  default     = "latest"
  description = "ECR tag of genfeed/server to deploy (CI passes the commit SHA via TF_VAR_image_tag)."
}

# ── Secrets ──────────────────────────────────────────────────────────
variable "ssm_path" {
  type        = string
  default     = "/genfeed/production"
  description = "SSM path whose params are injected as task secrets (one env var per param)."
}
