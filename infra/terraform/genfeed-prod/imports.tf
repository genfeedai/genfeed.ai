# One-time, non-destructive import of the pre-existing REDIS_PASSWORD SSM
# parameter (created 2026-06-09, before #931 added it to terraform) into state,
# so the managed aws_ssm_parameter.redis_password reconciles it (UPDATE) instead
# of failing on apply with ParameterAlreadyExists. Idempotent — a no-op once the
# resource is already tracked in state. Safe to remove in a later cleanup.
import {
  to = aws_ssm_parameter.redis_password
  id = "/genfeed/production/REDIS_PASSWORD"
}
