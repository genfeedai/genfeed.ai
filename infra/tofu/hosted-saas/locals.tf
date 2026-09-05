locals {
  name_prefix = "${var.project}-${var.environment}"
  fqdn        = "${var.api_subdomain}.${var.domain}"

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

  image = var.image_digest != "" ? "${aws_ecr_repository.server.repository_url}@${var.image_digest}" : "${aws_ecr_repository.server.repository_url}:${var.image_tag}"

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
    # Clerk has been fully replaced by Better Auth. Exclude legacy parameters
    # while they are removed from SSM so no task definition can retain or
    # reintroduce the retired runtime contract.
    "CLERK_SECRET_KEY",
    "CLERK_WEBHOOK_SIGNING_SECRET",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    # Google integrations now share one provider-level OAuth client. Exclude
    # every retired per-consumer alias so a legacy SSM parameter cannot keep an
    # obsolete env contract in newly registered task definitions.
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "YOUTUBE_CLIENT_ID",
    "YOUTUBE_CLIENT_SECRET",
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_SEARCH_CONSOLE_CLIENT_ID",
    "GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET",
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
  # AUTH is required: inject the Terraform-managed SecureString so every Redis
  # client presents a password. REDIS_PASSWORD stays in reserved_env_names so
  # a stale/manual SSM param cannot create a duplicate ECS secret name.
  redis_task_secrets = [{
    name      = "REDIS_PASSWORD"
    valueFrom = aws_ssm_parameter.redis_password.arn
  }]
  service_task_secrets = concat(local.task_secrets, local.redis_task_secrets)

  # Internet-facing ALB services must not receive the recursive production SSM
  # set (DATABASE_URL, TOKEN_ENCRYPTION_KEY, Stripe, AWS keys, …). Allowlists
  # follow each service's config schema; REDIS_PASSWORD is appended separately.
  public_backend_forbidden_secret_names = toset([
    "DATABASE_URL",
    "DIRECT_URL",
    "TOKEN_ENCRYPTION_KEY",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_API_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SIGNING_SECRET",
    "STRIPE_PUBLISHABLE_KEY",
  ])
  public_backend_secret_allowlist = {
    mcp = toset([
      "CHROMATIC_WEBHOOK_SECRET",
      "CHROME_EXTENSION_ID",
      "GENFEEDAI_API_KEY",
      "POSTHOG_HOST",
      "POSTHOG_PROJECT_API_KEY",
      "SENTRY_AUTH_TOKEN",
      "SENTRY_DSN",
      "SENTRY_ENABLED",
      "SENTRY_ENVIRONMENT",
      "VERCEL_WEBHOOK_SECRET",
    ])
    # BETTER_AUTH_URL is plaintext in local.internal_env (public issuer URL).
    # Do not add it here: ECS forbids the same name in environment and secrets.
    notifications = toset([
      "API_SECRET_KEY",
      "CHROMATIC_WEBHOOK_SECRET",
      "CHROME_EXTENSION_ID",
      "DISCORD_BOT_AVATAR_URL",
      "DISCORD_BOT_TOKEN",
      "DISCORD_CHANNEL_ID_DEPLOYMENTS",
      "DISCORD_CHANNEL_ID_MODELS",
      "DISCORD_CHANNEL_ID_POSTS",
      "DISCORD_CHANNEL_ID_STUDIO",
      "DISCORD_CHANNEL_ID_USERS",
      "DISCORD_CLIENT_ID",
      "DISCORD_GUILD_ID",
      "DISCORD_WEBHOOK_NAME_PREFIX",
      "DISCORD_WEBHOOK_REASON",
      "GENFEEDAI_API_KEY",
      "RESEND_API_KEY",
      "RESEND_FROM_EMAIL",
      "RESEND_REPLY_TO_EMAIL",
      "SENTRY_AUTH_TOKEN",
      "SENTRY_DSN",
      "SENTRY_ENABLED",
      "SENTRY_ENVIRONMENT",
      "SLACK_NOTIFICATION_BOT_TOKEN",
      "TELEGRAM_ADMIN_IDS",
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_BOT_USERNAME",
      "TWITCH_CLIENT_ID",
      "VERCEL_WEBHOOK_SECRET",
    ])
  }
  public_backend_task_secrets = {
    for name in local.public_backend_service_names : name => concat(
      [
        for secret in local.task_secrets : secret
        if contains(local.public_backend_secret_allowlist[name], secret.name)
      ],
      local.redis_task_secrets,
    )
  }

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

check "public_backend_secret_allowlists" {
  assert {
    condition = alltrue([
      for name in local.public_backend_service_names :
      contains(keys(local.public_backend_secret_allowlist), name) &&
      length(setintersection(
        local.public_backend_forbidden_secret_names,
        local.public_backend_secret_allowlist[name],
      )) == 0
    ])
    error_message = "Public backend secret allowlists must exist for every public ALB service and must not include DATABASE_URL-class secrets."
  }
}
