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
  target_group_arn = each.value.alb ? (each.key == "api" ? aws_lb_target_group.api.arn : aws_lb_target_group.public_backend[each.key].arn) : ""
  health_grace     = each.value.health_grace

  # Keep internal Cloud Map records present during deployments. Workers verify
  # dependent service DNS at startup, so stop-then-start rolls can race.
  min_healthy = 100
  max_percent = 200

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
    # Use `bun x` (the bun subcommand), NOT `bunx` — the server image ships the
    # `bun` binary but not a standalone `bunx`, so `["bunx", ...]` fell through to
    # the node entrypoint (`Cannot find module .../packages/prisma/bunx`) and the
    # migrate task exited 1. Matches the services' `["bun", ...]` invocation.
    command     = ["bun", "x", "prisma", "migrate", "deploy"]
    secrets     = local.task_secrets
    environment = [{ name = "NODE_ENV", value = "production" }]
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

# ── One-off boot smoke (run via `aws ecs run-task` BEFORE services roll) ─
# Boots the api with BOOT_SMOKE=1 so it fully initializes (catching crash-on-boot
# bugs like the circular-dependency TDZ in #711 that CI's lack of a boot test let
# ship) then exits 0 — without listening. Uses the api service's full env so the
# boot path is realistic. If the new image can't boot, the deploy fails HERE,
# before any service rolls.
resource "aws_cloudwatch_log_group" "boot_smoke" {
  name              = "/ecs/${local.name_prefix}/boot-smoke"
  retention_in_days = 30
}

resource "aws_ecs_task_definition" "boot_smoke" {
  family                   = "${local.name_prefix}-boot-smoke"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = local.services.api.cpu
  memory                   = local.services.api.mem
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "boot-smoke"
    image     = local.image
    essential = true
    command   = ["bun", "--filter", local.services.api.filter, "start:prod"]
    secrets   = local.task_secrets
    environment = concat(local.internal_env, [
      { name = "PORT", value = tostring(local.services.api.port) },
      { name = "SERVICE_NAME", value = "api" },
      { name = "BOOT_SMOKE", value = "1" },
    ])
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.boot_smoke.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "boot-smoke"
      }
    }
  }])
}
