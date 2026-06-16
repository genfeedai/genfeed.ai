# Managed redis, off the app instances (state must not live on ephemeral tasks).
# Single t4g.micro node (~$12/mo). SG-restricted to ECS only.
#
# NOTE: after apply, set the SSM param /genfeed/production/REDIS_URL to
#   redis://<primary_endpoint_address>:6379
# (no AUTH — access is gated by the cache SG). The app reads REDIS_URL from SSM,
# so no code change is needed; just repoint the param.

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name_prefix}-redis"
  subnet_ids = local.private_subnet_ids
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
  apply_immediately          = true
}
