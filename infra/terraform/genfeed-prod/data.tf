data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ── Existing RDS — to wire the ECS tasks SG into its security group ───
data "aws_db_instance" "genfeed" {
  db_instance_identifier = "genfeed-data"
}

# ── Route53 zone for genfeed.ai (assumes zone is in Route53) ─────────
data "aws_route53_zone" "main" {
  count        = var.route53_zone_id == "" ? 1 : 0
  name         = "${var.domain}."
  private_zone = false
}

locals {
  zone_id = var.route53_zone_id != "" ? var.route53_zone_id : data.aws_route53_zone.main[0].zone_id
}

# ── ECS-optimized AMI (Amazon Linux 2023) via SSM public parameter ──
data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
}

# ── App secrets under the SSM path (names + ARNs only; no decryption) ─
data "aws_ssm_parameters_by_path" "prod" {
  path            = var.ssm_path
  recursive       = true
  with_decryption = false
}
