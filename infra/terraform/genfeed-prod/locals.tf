locals {
  name_prefix = "${var.project}-${var.environment}"
  fqdn        = "${var.api_subdomain}.${var.domain}" # api.genfeed.ai

  public_backend_service_names = ["mcp", "notifications"]
  public_service_hostnames = merge(
    { api = local.fqdn },
    { for name in local.public_backend_service_names : name => "${name}.${var.domain}" },
  )
  public_target_group_prefixes = {
    mcp           = "gpmcp"
    notifications = "gpntf"
  }
  public_listener_priorities = {
    mcp           = 20
    notifications = 30
  }

  vpc_id             = var.vpc_id
  public_subnet_ids  = var.public_subnet_ids                # ALB (internet-facing)
  private_subnet_ids = [for s in aws_subnet.private : s.id] # ECS tasks/instances + cache (NAT egress)

  image = "${aws_ecr_repository.server.repository_url}:${var.image_tag}"

  # SSM params under ssm_path injected as task secrets: env var name = last path
  # segment (e.g. /genfeed/production/DATABASE_URL -> DATABASE_URL).
  # ECS forbids a `secrets` entry sharing a name with an `environment` entry, so
  # any SSM param we also set as a container env var (the Cloud Map inter-service
  # URLs, REDIS_URL, REDIS_TLS, NODE_ENV, VERSION, PORT, SERVICE_NAME) must be
  # filtered out of the injected secrets — the env value wins. REDIS_PASSWORD is
  # injected below from the Terraform-managed SecureString so stale/manual params
  # cannot create duplicate ECS secret names.
  reserved_env_names = toset(concat(
    [for e in local.internal_env : e.name],
    ["PORT", "SERVICE_NAME", "REDIS_PASSWORD"],
  ))
  ignored_ssm_secret_names = toset([
    # Retired Vercel deployment-notification gate. Keep it out of task definitions
    # even if a stale temporary parameter is present under the production path.
    "VERCEL_DEPLOYMENT_NOTIFICATIONS_ENABLED",
  ])
  excluded_ssm_secret_names = setunion(local.reserved_env_names, local.ignored_ssm_secret_names)
  task_secrets = [
    for i, name in data.aws_ssm_parameters_by_path.prod.names : {
      name      = element(reverse(split("/", name)), 0)
      valueFrom = data.aws_ssm_parameters_by_path.prod.arns[i]
    } if !contains(local.excluded_ssm_secret_names, element(reverse(split("/", name)), 0))
  ]
  # AUTH deferred (see elasticache.tf): the app connects over TLS without a
  # password while Redis AUTH is off. Re-add the REDIS_PASSWORD secret here when
  # auth_token is enabled in the follow-up migration.
  redis_task_secrets   = []
  service_task_secrets = concat(local.task_secrets, local.redis_task_secrets)

  # ── Service catalogue (mirrors docker-compose.production.yml) ─────────
  # Fargate launch type: cpu/mem MUST be valid Fargate task pairs (256→512-2048,
  # 512→1024-4096, 1024→2048-8192). Each task gets its own ENI from the private
  # subnets (NAT egress) — no per-instance ENI cap. Every service registers in
  # Cloud Map for internal DNS; api/mcp/notifications are also behind the public
  # ALB. (Tune api/workers cpu up if boot/throughput needs it — these are lean
  # starting points.)
  # desired=0 keeps the service + task def defined (code stays, flip on anytime)
  # but runs zero tasks => ~$0. Bots/clips are built but unused, so they're parked
  # at 0. Core set (api + its boot-required deps files/mcp/notifications, +
  # workers) runs at 1.
  services = {
    api           = { filter = "@genfeedai/api", port = 3010, cpu = 1024, mem = 2048, alb = true, health_grace = 600, desired = 1 }
    workers       = { filter = "@genfeedai/workers", port = 3013, cpu = 512, mem = 2048, alb = false, health_grace = 600, desired = 1 }
    files         = { filter = "@genfeedai/files", port = 3012, cpu = 256, mem = 512, alb = false, health_grace = 60, desired = 1 }
    mcp           = { filter = "@genfeedai/mcp", port = 3014, cpu = 256, mem = 512, alb = true, health_grace = 60, desired = 1 }
    notifications = { filter = "@genfeedai/notifications", port = 3011, cpu = 256, mem = 512, alb = true, health_grace = 60, desired = 1 }
    discord       = { filter = "@genfeedai/discord", port = 3016, cpu = 256, mem = 512, alb = false, health_grace = 60, desired = 0 }
    slack         = { filter = "@genfeedai/slack", port = 3018, cpu = 256, mem = 512, alb = false, health_grace = 60, desired = 0 }
    telegram      = { filter = "@genfeedai/telegram", port = 3019, cpu = 256, mem = 512, alb = false, health_grace = 60, desired = 0 }
  }
}
