# One-time, non-destructive import of the pre-existing REDIS_PASSWORD SSM
# parameter (created 2026-06-09, before #931 added it to terraform) into state,
# so the managed aws_ssm_parameter.redis_password reconciles it (UPDATE) instead
# of failing on apply with ParameterAlreadyExists. Idempotent — a no-op once the
# resource is already tracked in state. Safe to remove in a later cleanup.
import {
  to = aws_ssm_parameter.redis_password
  id = "${var.ssm_path}/REDIS_PASSWORD"
}

# Same shape for the Redis parameter group. genfeed-production-redis7 was created
# by hand during the 2026-08-25 incident response to move production off
# volatile-lru, then declared in code by #3564. Without this block the next apply
# fails on CacheParameterGroupAlreadyExists, because the group exists in AWS but
# not in state. Idempotent — a no-op once tracked. Safe to remove in a later cleanup.
import {
  to = aws_elasticache_parameter_group.redis
  id = "${local.name_prefix}-redis7"
}
