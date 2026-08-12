locals {
  active_services = {
    for name, service in local.services : name => service
    if service.desired > 0
  }

  public_target_group_suffixes = merge(
    { api = aws_lb_target_group.api.arn_suffix },
    { for name, target_group in aws_lb_target_group.public_backend : name => target_group.arn_suffix },
  )

  runbook_base = "https://github.com/genfeedai/genfeed.ai/blob/master/docs/operations/aws-monitoring.md"
}

# Production alarms are operational AWS resources and are intentionally not
# provisioned or managed by this public OpenTofu stack.

# The dashboard references 38 metrics, below its 50-metric pricing boundary.
resource "aws_cloudwatch_dashboard" "production" {
  dashboard_name = local.name_prefix

  dashboard_body = jsonencode({
    widgets = concat(
      [
        {
          type   = "text"
          x      = 0
          y      = 0
          width  = 24
          height = 2
          properties = {
            markdown = "# Genfeed production\nCloudWatch-first baseline. [Runbook](${local.runbook_base})"
          }
        },
        {
          type   = "metric"
          x      = 0
          y      = 2
          width  = 12
          height = 6
          properties = {
            title   = "ECS CPU utilization"
            region  = var.region
            view    = "timeSeries"
            stacked = false
            period  = 300
            metrics = [for name, service in local.active_services : [
              "AWS/ECS", "CPUUtilization",
              "ClusterName", aws_ecs_cluster.main.name,
              "ServiceName", name,
              { label = name, stat = "Average" },
            ]]
          }
        },
        {
          type   = "metric"
          x      = 12
          y      = 2
          width  = 12
          height = 6
          properties = {
            title   = "ECS memory utilization"
            region  = var.region
            view    = "timeSeries"
            stacked = false
            period  = 300
            metrics = [for name, service in local.active_services : [
              "AWS/ECS", "MemoryUtilization",
              "ClusterName", aws_ecs_cluster.main.name,
              "ServiceName", name,
              { label = name, stat = "Average" },
            ]]
          }
        },
        {
          type   = "metric"
          x      = 0
          y      = 8
          width  = 24
          height = 5
          properties = {
            title   = "ECS live tasks"
            region  = var.region
            view    = "timeSeries"
            stacked = false
            period  = 60
            metrics = [for name, service in local.active_services : [
              "AWS/ECS", "LiveTaskCount",
              "ClusterName", aws_ecs_cluster.main.name,
              "ServiceName", name,
              { label = "${name} (desired ${service.desired})", stat = "Minimum" },
            ]]
          }
        },
        {
          type   = "metric"
          x      = 0
          y      = 32
          width  = 24
          height = 7
          properties = {
            title   = "Aggregate BullMQ health"
            region  = var.region
            view    = "timeSeries"
            stacked = false
            period  = 300
            metrics = [
              ["Genfeed/Queues", "WaitingJobs", "Service", "workers", { label = "Waiting", stat = "Maximum" }],
              ["Genfeed/Queues", "OldestWaitingAgeSeconds", "Service", "workers", { label = "Oldest waiting seconds", stat = "Maximum" }],
              ["Genfeed/Queues", "FailedJobs5m", "Service", "workers", { label = "Failed / 5m", stat = "Sum" }],
              ["Genfeed/Queues", "StalledJobs5m", "Service", "workers", { label = "Stalled / 5m", stat = "Sum" }],
            ]
          }
        },
      ],
      [
        for index, metric in [
          { name = "HealthyHostCount", title = "ALB healthy targets", stat = "Minimum" },
          { name = "HTTPCode_Target_5XX_Count", title = "ALB target 5xx", stat = "Sum" },
          { name = "TargetResponseTime", title = "ALB target response time", stat = "p95" },
          ] : {
          type   = "metric"
          x      = (index % 2) * 12
          y      = 13 + floor(index / 2) * 6
          width  = 12
          height = 6
          properties = {
            title   = metric.title
            region  = var.region
            view    = "timeSeries"
            stacked = false
            period  = 300
            metrics = [for name, target_group_suffix in local.public_target_group_suffixes : [
              "AWS/ApplicationELB", metric.name,
              "LoadBalancer", aws_lb.main.arn_suffix,
              "TargetGroup", target_group_suffix,
              { label = name, stat = metric.stat },
            ]]
          }
        }
      ],
      [
        {
          type   = "metric"
          x      = 0
          y      = 25
          width  = 12
          height = 7
          properties = {
            title   = "RDS PostgreSQL"
            region  = var.region
            view    = "timeSeries"
            stacked = false
            period  = 300
            metrics = [
              ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", data.aws_db_instance.genfeed.id, { label = "CPU %", stat = "Average" }],
              ["AWS/RDS", "FreeableMemory", "DBInstanceIdentifier", data.aws_db_instance.genfeed.id, { label = "Freeable memory", stat = "Minimum", yAxis = "right" }],
              ["AWS/RDS", "FreeStorageSpace", "DBInstanceIdentifier", data.aws_db_instance.genfeed.id, { label = "Free storage", stat = "Minimum", yAxis = "right" }],
              ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", data.aws_db_instance.genfeed.id, { label = "Connections", stat = "Maximum" }],
              ["AWS/RDS", "ReadLatency", "DBInstanceIdentifier", data.aws_db_instance.genfeed.id, { label = "Read latency", stat = "Average" }],
              ["AWS/RDS", "WriteLatency", "DBInstanceIdentifier", data.aws_db_instance.genfeed.id, { label = "Write latency", stat = "Average" }],
            ]
          }
        },
        {
          type   = "metric"
          x      = 12
          y      = 25
          width  = 12
          height = 7
          properties = {
            title   = "Redis / BullMQ backing store"
            region  = var.region
            view    = "timeSeries"
            stacked = false
            period  = 300
            metrics = [
              ["AWS/ElastiCache", "DatabaseMemoryUsagePercentage", "CacheClusterId", one(aws_elasticache_replication_group.redis.member_clusters), { label = "Database memory %", stat = "Maximum" }],
              ["AWS/ElastiCache", "EngineCPUUtilization", "CacheClusterId", one(aws_elasticache_replication_group.redis.member_clusters), { label = "Engine CPU %", stat = "Average" }],
              ["AWS/ElastiCache", "Evictions", "CacheClusterId", one(aws_elasticache_replication_group.redis.member_clusters), { label = "Evictions", stat = "Sum" }],
              ["AWS/ElastiCache", "CurrConnections", "CacheClusterId", one(aws_elasticache_replication_group.redis.member_clusters), { label = "Connections", stat = "Maximum" }],
            ]
          }
        },
      ],
    )
  })
}
