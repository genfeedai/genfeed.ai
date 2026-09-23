import {
  to = aws_ssm_parameter.redis_password
  id = "${var.ssm_path}/REDIS_PASSWORD"
}

import {
  to = aws_elasticache_parameter_group.redis
  id = "${local.name_prefix}-redis7"
}
