# Managed redis, off the app instances (state must not live on ephemeral tasks).
# Single t4g.micro node (~$12/mo). SG-restricted to ECS only. Production tasks
# connect with TLS and AUTH; the auth token is stored as an SSM SecureString and
# injected into ECS task definitions as REDIS_PASSWORD.

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
  auth_token                 = random_password.redis_auth_token.result
  auth_token_update_strategy = "SET"
  apply_immediately          = true
}
