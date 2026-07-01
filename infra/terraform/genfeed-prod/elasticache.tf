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
  # AWS requires a transit_encryption_mode when enabling in-transit encryption on
  # an existing replication group. "preferred" accepts both encrypted and
  # unencrypted client connections during the migration, so existing non-TLS
  # clients keep working while services roll over to TLS+AUTH. Tighten to
  # "required" in a follow-up once all clients use rediss://.
  transit_encryption_mode    = "preferred"
  # AUTH deferred: AWS only allows setting auth_token once transit_encryption_mode
  # is "required", which in turn requires every client to already be on TLS. That
  # is a staged migration (app -> rediss:// first, then "required" + auth_token),
  # not a single apply. Transit encryption is enabled here (preferred) and the app
  # connects over TLS without AUTH; enable auth_token in a follow-up once all
  # clients are confirmed on rediss://.
  apply_immediately          = true

  # AUTH is deferred (see above). Terraform state still carries
  # auth_token_update_strategy = "SET" from an earlier partial apply, so ANY plan
  # touching the auth fields (even resetting the strategy to its default) is
  # rejected by AWS with "AUTH token modification is only supported when
  # encryption-in-transit is enabled" until transit_encryption_mode is "required".
  # Ignore the auth fields so terraform stops planning an auth modification and the
  # deploy can roll. Remove this in the follow-up that enables AUTH (switch to
  # "required" mode + set auth_token).
  lifecycle {
    ignore_changes = [auth_token, auth_token_update_strategy]
  }
}
