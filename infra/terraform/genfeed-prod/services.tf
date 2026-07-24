locals {
  # Internal service URLs via Cloud Map (replace docker-compose http://files:3012).
  internal_env = [
    # Production ECS is the hosted cloud deployment. Keep this explicit so
    # server-side deployment-mode gates agree with the Vercel frontend.
    { name = "GENFEED_CLOUD", value = "true" },
    { name = "GENFEEDAI_MICROSERVICES_FILES_URL", value = "http://files.genfeed.internal:${local.services.files.port}" },
    { name = "GENFEEDAI_MICROSERVICES_MCP_URL", value = "http://mcp.genfeed.internal:${local.services.mcp.port}" },
    { name = "GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL", value = "http://notifications.genfeed.internal:${local.services.notifications.port}" },
    { name = "GENFEEDAI_API_PUBLIC_URL", value = "https://api.genfeed.ai" },
    { name = "GENFEEDAI_API_URL", value = "http://api.genfeed.internal:${local.services.api.port}" },
    { name = "GENFEEDAI_MCP_PUBLIC_URL", value = "https://mcp.genfeed.ai/mcp" },
    { name = "REDIS_URL", value = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379" },
    { name = "REDIS_TLS", value = "true" },
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

  secrets = local.service_task_secrets
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
  retention_in_days = 7
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
    secrets     = local.service_task_secrets
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

# ── One-off workflow backfill (run after Prisma migrations, before api rolls) ─
resource "aws_cloudwatch_log_group" "workflow_backfill" {
  name              = "/ecs/${local.name_prefix}/workflow-backfill"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "workflow_backfill" {
  family                   = "${local.name_prefix}-workflow-backfill"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = local.services.api.cpu
  memory                   = local.services.api.mem
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "workflow-backfill"
    image     = local.image
    essential = true
    command   = ["bun", "--filter", local.services.api.filter, "migrate:workflows"]
    secrets   = local.service_task_secrets
    environment = concat(local.internal_env, [
      { name = "PORT", value = tostring(local.services.api.port) },
      { name = "SERVICE_NAME", value = "api" },
    ])
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.workflow_backfill.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "workflow-backfill"
      }
    }
  }])
}

# ── One-off credential-encryption backfill (run AFTER services reach steady ──
# state with the new image, so new pods — which know how to read ciphertext —
# are already live before any row is written. Skips rows already encrypted
# (idempotent); safe on every deploy. Requires TOKEN_ENCRYPTION_KEY in SSM
# under the prod path — the same mechanism that feeds the running api service.
resource "aws_cloudwatch_log_group" "credential_backfill" {
  name              = "/ecs/${local.name_prefix}/credential-backfill"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "credential_backfill" {
  family                   = "${local.name_prefix}-credential-backfill"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = local.services.api.cpu
  memory                   = local.services.api.mem
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "credential-backfill"
    image     = local.image
    essential = true
    command   = ["bun", "--filter", local.services.api.filter, "migrate:credentials"]
    secrets   = local.service_task_secrets
    environment = concat(local.internal_env, [
      { name = "PORT", value = tostring(local.services.api.port) },
      { name = "SERVICE_NAME", value = "api" },
    ])
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.credential_backfill.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "credential-backfill"
      }
    }
  }])
}

# ── One-off boot smoke (run via `aws ecs run-task` BEFORE services roll) ─
# Starts the production api command and requires localhost /v1/health to answer.
# This catches both crash-on-boot bugs and "loads but never binds the port"
# failures before any service rolls.
resource "aws_cloudwatch_log_group" "boot_smoke" {
  name              = "/ecs/${local.name_prefix}/boot-smoke"
  retention_in_days = 7
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
    command = [
      "bash",
      "-lc",
      <<-EOT
      set -uo pipefail
      bun --filter ${local.services.api.filter} start:prod &
      pid=$!
      cleanup() {
        # After health succeeds, do not wait on Bun/API shutdown; SIGTERM exit
        # status would turn a successful smoke into a failed ECS task.
        kill "$pid" 2>/dev/null || true
      }
      trap cleanup EXIT

      for i in $(seq 1 48); do
        if ! kill -0 "$pid" 2>/dev/null; then
          wait "$pid"
          exit "$?"
        fi
        if curl -fsS http://127.0.0.1:${local.services.api.port}/v1/health >/dev/null; then
          echo 'Boot smoke OK - API served /v1/health.'
          trap - EXIT
          cleanup
          exit 0
        fi
        sleep 10
      done

      echo 'API did not serve /v1/health within boot-smoke window' >&2
      exit 1
      EOT
    ]
    secrets = local.service_task_secrets
    environment = concat(local.internal_env, [
      { name = "PORT", value = tostring(local.services.api.port) },
      { name = "SERVICE_NAME", value = "api" },
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

# Workers have a separate Nest application graph and health server, so the API
# boot smoke cannot prove that the queue/cron runtime starts. Run this task
# before Terraform rolls the workers service; a DI/import/startup regression
# then fails with a dedicated CloudWatch log instead of churning ECS tasks.
resource "aws_cloudwatch_log_group" "worker_boot_smoke" {
  name              = "/ecs/${local.name_prefix}/worker-boot-smoke"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "worker_boot_smoke" {
  family                   = "${local.name_prefix}-worker-boot-smoke"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = local.services.workers.cpu
  memory                   = local.services.workers.mem
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "worker-boot-smoke"
    image     = local.image
    essential = true
    command = [
      "bash",
      "-lc",
      <<-EOT
      set -uo pipefail
      bun --filter ${local.services.workers.filter} start:prod &
      pid=$!
      cleanup() {
        kill "$pid" 2>/dev/null || true
      }
      trap cleanup EXIT

      for i in $(seq 1 72); do
        if ! kill -0 "$pid" 2>/dev/null; then
          wait "$pid"
          exit "$?"
        fi
        if curl -fsS http://127.0.0.1:${local.services.workers.port}/v1/health >/dev/null; then
          echo 'Boot smoke OK - workers served /v1/health.'
          trap - EXIT
          cleanup
          exit 0
        fi
        sleep 10
      done

      echo 'Workers did not serve /v1/health within boot-smoke window' >&2
      exit 1
      EOT
    ]
    secrets = local.service_task_secrets
    environment = concat(local.internal_env, [
      { name = "PORT", value = tostring(local.services.workers.port) },
      { name = "SERVICE_NAME", value = "workers" },
    ])
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.worker_boot_smoke.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "worker-boot-smoke"
      }
    }
  }])
}
