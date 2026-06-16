# ── ALB SG: public 80/443 ────────────────────────────────────────────
resource "aws_security_group" "alb" {
  name_prefix = "${local.name_prefix}-alb-"
  vpc_id      = local.vpc_id
  description = "genfeed ALB"

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  lifecycle { create_before_destroy = true }
}

# ── ECS container-instance / task SG ─────────────────────────────────
# Bridge mode + static host ports: the ALB reaches api on its host port, and
# services reach each other host-IP:port (Cloud Map A record -> host IP), so
# allow the ALB and self on the service port range.
resource "aws_security_group" "ecs" {
  name_prefix = "${local.name_prefix}-ecs-"
  vpc_id      = local.vpc_id
  description = "genfeed ECS container instances"

  ingress {
    description     = "ALB to service ports"
    from_port       = 3010
    to_port         = 3019
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  ingress {
    description = "intra-cluster service-to-service"
    from_port   = 3010
    to_port     = 3019
    protocol    = "tcp"
    self        = true
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  lifecycle { create_before_destroy = true }
}

# ── ElastiCache SG: 6379 from ECS only ───────────────────────────────
resource "aws_security_group" "cache" {
  name_prefix = "${local.name_prefix}-cache-"
  vpc_id      = local.vpc_id
  description = "genfeed ElastiCache redis"

  ingress {
    description     = "redis from ECS"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  lifecycle { create_before_destroy = true }
}

# ── Let ECS tasks reach the existing RDS ─────────────────────────────
resource "aws_security_group_rule" "rds_from_ecs" {
  type                     = "ingress"
  description              = "genfeed ECS tasks to RDS"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = tolist(data.aws_db_instance.genfeed.vpc_security_groups)[0]
  source_security_group_id = aws_security_group.ecs.id
}
