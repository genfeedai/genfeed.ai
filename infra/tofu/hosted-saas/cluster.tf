resource "aws_ecs_cluster" "main" {
  name = local.name_prefix
  # Container Insights publishes per-task/container custom metrics (~$40/mo at
  # our service count) that we don't currently use — Sentry covers errors/perf
  # and free ECS service metrics still drive alarms/autoscaling. Re-enable
  # temporarily when debugging task-level resource issues (OOM, right-sizing).
  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

# Fargate-only capacity. Each task gets its own ENI from the private subnets
# (NAT egress) — no EC2 instances to manage and no per-instance ENI cap (the
# reason t3a.medium EC2 capacity couldn't fit all 9 awsvpc services).
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 0
  }
}
