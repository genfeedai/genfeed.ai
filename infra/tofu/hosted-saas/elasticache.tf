# Managed redis, off the app instances (state must not live on ephemeral tasks).
# Single t4g.micro node (~$12/mo). SG-restricted to ECS only. Production tasks
# connect with TLS and AUTH; the auth token is stored as an SSM SecureString and
# injected into ECS task definitions as REDIS_PASSWORD.

# Live endpoint without a graph edge onto the managed resource. Task
# definitions interpolate this so OpenTofu `-target` on one-off task defs
# cannot also apply Redis AUTH (1.12 forbids mixing `-target` and `-exclude`).
# The cluster already exists; AUTH is applied later, after ECS injects
# REDIS_PASSWORD.
data "aws_elasticache_replication_group" "current" {
  replication_group_id = "${local.name_prefix}-redis"
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name_prefix}-redis"
  subnet_ids = local.private_subnet_ids
}

resource "random_password" "redis_auth_token" {
  length  = 64
  special = false
}

resource "aws_ssm_parameter" "redis_password" {
  name        = "${var.ssm_path}/REDIS_PASSWORD"
  description = "Production ElastiCache Redis AUTH token."
  type        = "SecureString"
  value       = random_password.redis_auth_token.result
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${local.name_prefix}-redis"
  description                = "genfeed production redis"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = "cache.t4g.micro"
  num_cache_clusters         = 1
  port                       = 6379
  parameter_group_name       = "default.redis7"
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.cache.id]
  automatic_failover_enabled = false
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  # Reject plaintext Redis. Clients already use rediss:// + REDIS_TLS=true;
  # "required" is the approved transport and is a prerequisite for AUTH.
  # The deploy workflow applies this resource only after ECS tasks inject
  # REDIS_PASSWORD, so in-flight unauthenticated clients are not locked out.
  transit_encryption_mode    = "required"
  auth_token                 = random_password.redis_auth_token.result
  auth_token_update_strategy = var.redis_auth_token_update_strategy
  apply_immediately          = true
}
