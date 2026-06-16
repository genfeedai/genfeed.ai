locals {
  # Internal service URLs via Cloud Map (replace docker-compose http://files:3012).
  internal_env = [
    { name = "GENFEEDAI_MICROSERVICES_FILES_URL", value = "http://files.genfeed.internal:${local.services.files.port}" },
    { name = "GENFEEDAI_MICROSERVICES_MCP_URL", value = "http://mcp.genfeed.internal:${local.services.mcp.port}" },
    { name = "GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL", value = "http://notifications.genfeed.internal:${local.services.notifications.port}" },
    { name = "GENFEEDAI_API_URL", value = "http://api.genfeed.internal:${local.services.api.port}" },
    { name = "REDIS_URL", value = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379" },
    { name = "NODE_ENV", value = "production" },
    { name = "VERSION", value = "1.0.0" },
  ]
}

module "service" {
  source   = "../modules/service"
  for_each = local.services

  name              = each.key
  name_prefix       = local.name_prefix
  cluster_id        = aws_ecs_cluster.main.id
  capacity_provider = "FARGATE"
  image             = local.image
  command           = ["bun", "--filter", each.value.filter, "start:prod"]
  cpu               = each.value.cpu
  memory            = each.value.mem
  port              = each.value.port
  region            = var.region

  execution_role_arn = aws_iam_role.execution.arn
  task_role_arn      = aws_iam_role.task.arn

  subnets            = local.private_subnet_ids
  security_group_ids = [aws_security_group.ecs.id]
  namespace_id       = aws_service_discovery_private_dns_namespace.internal.id

  secrets = local.task_secrets
  environment = concat(local.internal_env, [
    { name = "PORT", value = tostring(each.value.port) },
    { name = "SERVICE_NAME", value = each.key },
  ])

  desired_count    = each.value.desired
  register_alb     = each.value.alb
  target_group_arn = each.value.alb ? aws_lb_target_group.api.arn : ""
  health_grace     = each.value.health_grace

  # api rolls zero-downtime (needs the 2nd box as headroom); single-task
  # bots/workers tolerate a brief blip on deploy.
  min_healthy = each.value.alb ? 100 : 0
  max_percent = each.value.alb ? 200 : 100

  depends_on = [aws_ecs_cluster_capacity_providers.main]
}

# ── One-off migration task (run via `aws ecs run-task` before api rolls) ─
resource "aws_cloudwatch_log_group" "migrate" {
  name              = "/ecs/${local.name_prefix}/migrate"
  retention_in_days = 30
}

resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name_prefix}-migrate"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name             = "migrate"
    image            = local.image
    essential        = true
    workingDirectory = "/usr/src/app/packages/prisma"
    command          = ["bunx", "prisma", "migrate", "deploy"]
    secrets          = local.task_secrets
    environment      = [{ name = "NODE_ENV", value = "production" }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.migrate.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "migrate"
      }
    }
  }])
}
