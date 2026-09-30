data "aws_caller_identity" "current" {}
data "terraform_remote_state" "hosted" {
  backend = "s3"
  config  = { bucket = var.state_bucket, key = var.hosted_state_key, region = var.region }
}
locals {
  prefix            = "${var.project}-production"
  fqdn              = "api.marketplace.${var.domain}"
  hosted            = data.terraform_remote_state.hosted.outputs
  secret_arn_prefix = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter"
  image             = "${aws_ecr_repository.marketplace.repository_url}@${var.image_digest}"
  app_secret_names  = ["DATABASE_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]
  app_secrets       = [for name in local.app_secret_names : { name = name, valueFrom = "${local.secret_arn_prefix}${var.ssm_path}/${name}" }]
  environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = "3200" },
    { name = "GENFEED_API_URL", value = "https://api.${var.domain}" },
    { name = "MARKETPLACE_URL", value = "https://marketplace.${var.domain}" },
    { name = "BETTER_AUTH_ISSUER", value = "https://api.${var.domain}" },
    { name = "BETTER_AUTH_AUDIENCE", value = "https://api.${var.domain}" },
    { name = "BETTER_AUTH_JWKS_URL", value = "https://api.${var.domain}/v1/auth/jwks" },
  ]
}
resource "aws_ecr_repository" "marketplace" {
  name                 = "${var.project}/marketplace"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}
import {
  to = aws_ecr_repository.marketplace
  id = "${var.project}/marketplace"
}
resource "aws_ecr_lifecycle_policy" "marketplace" {
  repository = aws_ecr_repository.marketplace.name
  policy     = jsonencode({ rules = [{ rulePriority = 1, description = "Keep twenty Marketplace images", selection = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 20 }, action = { type = "expire" } }] })
}
data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}
resource "aws_iam_role" "execution" {
  name               = "${local.prefix}-marketplace-execution"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}
resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
resource "aws_iam_role_policy" "secrets" {
  role = aws_iam_role.execution.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["ssm:GetParameters"], Resource = concat([for name in concat(local.app_secret_names, ["MIGRATION_DATABASE_URL"]) : "${local.secret_arn_prefix}${var.ssm_path}/${name}"], var.database_admin_parameter == "" ? [] : ["${local.secret_arn_prefix}${var.database_admin_parameter}"]) },
    { Effect = "Allow", Action = ["kms:Decrypt"], Resource = "*", Condition = { StringEquals = { "kms:ViaService" = "ssm.${var.region}.amazonaws.com" } } },
  ] })
}
resource "aws_iam_role" "task" {
  name               = "${local.prefix}-marketplace-task"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}
resource "aws_iam_role" "bootstrap" {
  name               = "${local.prefix}-marketplace-bootstrap"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}
resource "aws_iam_role_policy" "bootstrap" {
  role = aws_iam_role.bootstrap.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["ssm:GetParameter", "ssm:PutParameter"], Resource = [for name in ["DATABASE_URL", "MIGRATION_DATABASE_URL"] : "${local.secret_arn_prefix}${var.ssm_path}/${name}"] },
    { Effect = "Allow", Action = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"], Resource = "*", Condition = { StringEquals = { "kms:ViaService" = "ssm.${var.region}.amazonaws.com" } } },
  ] })
}
resource "aws_security_group" "marketplace" {
  name_prefix = "${local.prefix}-marketplace-"
  description = "Dedicated Marketplace API tasks"
  vpc_id      = local.hosted.vpc_id
  ingress {
    from_port       = 3200
    to_port         = 3200
    protocol        = "tcp"
    security_groups = [local.hosted.alb_security_group_id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_vpc_security_group_ingress_rule" "postgres" {
  for_each                     = toset(local.hosted.rds_security_group_ids)
  security_group_id            = each.value
  referenced_security_group_id = aws_security_group.marketplace.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}
resource "aws_cloudwatch_log_group" "operations" {
  name              = "/ecs/${local.prefix}/marketplace-operations"
  retention_in_days = 7
}
resource "aws_ecs_task_definition" "operation" {
  depends_on               = [aws_iam_role_policy.secrets, aws_iam_role_policy_attachment.execution, aws_iam_role_policy.bootstrap, aws_vpc_security_group_ingress_rule.postgres]
  for_each                 = var.database_admin_parameter == "" ? toset(["migrate"]) : toset(["bootstrap", "migrate"])
  family                   = "${local.prefix}-marketplace-${each.key}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = each.key == "bootstrap" ? aws_iam_role.bootstrap.arn : aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name             = "marketplace-${each.key}", image = local.image, essential = true,
    command          = each.key == "bootstrap" ? ["node", "dist/ops/provision-database.js"] : ["bun", "run", "prisma:migrate"],
    environment      = concat(local.environment, [{ name = "MARKETPLACE_SSM_PATH", value = var.ssm_path }]),
    secrets          = each.key == "bootstrap" ? [{ name = "DATABASE_ADMIN_URL", valueFrom = "${local.secret_arn_prefix}${var.database_admin_parameter}" }] : [{ name = "DATABASE_URL", valueFrom = "${local.secret_arn_prefix}${var.ssm_path}/MIGRATION_DATABASE_URL" }],
    logConfiguration = { logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.operations.name, "awslogs-region" = var.region, "awslogs-stream-prefix" = each.key } },
  }])
}
resource "aws_acm_certificate" "api" {
  domain_name       = local.fqdn
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}
resource "aws_route53_record" "validation" {
  for_each = { for d in aws_acm_certificate.api.domain_validation_options : d.domain_name => d }
  zone_id  = local.hosted.route53_zone_id
  name     = each.value.resource_record_name
  type     = each.value.resource_record_type
  records  = [each.value.resource_record_value]
  ttl      = 60
}
resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.validation : r.fqdn]
}
resource "aws_lb_listener_certificate" "api" {
  listener_arn    = local.hosted.https_listener_arn
  certificate_arn = aws_acm_certificate_validation.api.certificate_arn
}
resource "aws_lb_target_group" "api" {
  name_prefix = "gpmkt"
  port        = 3200
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = local.hosted.vpc_id
  health_check {
    path                = "/health/ready"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  lifecycle { create_before_destroy = true }
}
resource "aws_lb_listener_rule" "api" {
  listener_arn = local.hosted.https_listener_arn
  priority     = 40
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
  condition {
    host_header { values = [local.fqdn] }
  }
}
module "api" {
  count              = var.enable_service ? 1 : 0
  source             = "../modules/service"
  name               = "marketplace"
  name_prefix        = local.prefix
  cluster_id         = local.hosted.cluster_arn
  capacity_provider  = "FARGATE"
  image              = local.image
  command            = ["node", "dist/main.js"]
  cpu                = 256
  memory             = 512
  port               = 3200
  region             = var.region
  execution_role_arn = aws_iam_role.execution.arn
  task_role_arn      = aws_iam_role.task.arn
  subnets            = local.hosted.task_subnets
  security_group_ids = [aws_security_group.marketplace.id]
  namespace_id       = local.hosted.service_discovery_namespace_id
  secrets            = local.app_secrets
  environment        = local.environment
  desired_count      = 1
  register_alb       = true
  target_group_arn   = aws_lb_target_group.api.arn
  health_path        = "/health/ready"
  health_grace       = 60
  depends_on         = [aws_lb_listener_rule.api]
}
resource "aws_route53_record" "api" {
  count   = var.enable_service && var.enable_dns_cutover ? 1 : 0
  zone_id = local.hosted.route53_zone_id
  name    = local.fqdn
  type    = "A"
  alias {
    name                   = local.hosted.alb_dns_name
    zone_id                = local.hosted.alb_zone_id
    evaluate_target_health = true
  }
}
