locals {
  name_prefix = "${var.project}-${var.environment}"
  fqdn        = "${var.api_subdomain}.${var.domain}" # api.genfeed.ai

  vpc_id             = var.vpc_id
  public_subnet_ids  = var.public_subnet_ids                  # ALB (internet-facing)
  private_subnet_ids = [for s in aws_subnet.private : s.id]   # ECS tasks/instances + cache (NAT egress)

  image = "${aws_ecr_repository.server.repository_url}:${var.image_tag}"

  # SSM params under ssm_path injected as task secrets: env var name = last path
  # segment (e.g. /genfeed/production/DATABASE_URL -> DATABASE_URL).
  # ECS forbids a `secrets` entry sharing a name with an `environment` entry, so
  # any SSM param we also set as a container env var (the Cloud Map inter-service
  # URLs, REDIS_URL, NODE_ENV, VERSION, PORT, SERVICE_NAME) must be filtered out
  # of the injected secrets — the env value wins. REDIS_PASSWORD is dropped too:
  # ElastiCache is no-auth (private + SG-locked) and redis-connection.utils.ts
  # would otherwise send AUTH (which a no-auth server rejects).
  reserved_env_names = toset(concat(
    [for e in local.internal_env : e.name],
    ["PORT", "SERVICE_NAME", "REDIS_PASSWORD"],
  ))
  task_secrets = [
    for i, name in data.aws_ssm_parameters_by_path.prod.names : {
      name      = element(reverse(split("/", name)), 0)
      valueFrom = data.aws_ssm_parameters_by_path.prod.arns[i]
    } if !contains(local.reserved_env_names, element(reverse(split("/", name)), 0))
  ]

  # ── Service catalogue (mirrors docker-compose.production.yml) ─────────
  # mem = hard memory MB (matches the mem_limits in compose); cpu = CPU shares
  # (1024 = 1 vCPU; kept modest so ~9 tasks bin-pack across 2× t3a.medium).
  # Every service registers in Cloud Map for internal name resolution; only api
  # is also placed behind the public ALB.
  services = {
    api           = { filter = "@genfeedai/api", port = 3010, mem = 1280, cpu = 512, alb = true, health_grace = 90 }
    workers       = { filter = "@genfeedai/workers", port = 3013, mem = 1536, cpu = 512, alb = false, health_grace = 40 }
    files         = { filter = "@genfeedai/files", port = 3012, mem = 512, cpu = 256, alb = false, health_grace = 40 }
    mcp           = { filter = "@genfeedai/mcp", port = 3014, mem = 384, cpu = 128, alb = false, health_grace = 40 }
    notifications = { filter = "@genfeedai/notifications", port = 3011, mem = 384, cpu = 128, alb = false, health_grace = 40 }
    clips         = { filter = "@genfeedai/clips", port = 3015, mem = 384, cpu = 128, alb = false, health_grace = 40 }
    discord       = { filter = "@genfeedai/discord", port = 3016, mem = 320, cpu = 128, alb = false, health_grace = 40 }
    slack         = { filter = "@genfeedai/slack", port = 3018, mem = 320, cpu = 128, alb = false, health_grace = 40 }
    telegram      = { filter = "@genfeedai/telegram", port = 3019, mem = 320, cpu = 128, alb = false, health_grace = 40 }
  }
}
