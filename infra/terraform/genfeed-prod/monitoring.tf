locals {
  active_services = {
    for name, service in local.services : name => service
    if service.desired > 0
  }

  public_target_group_suffixes = merge(
    { api = aws_lb_target_group.api.arn_suffix },
    { for name, target_group in aws_lb_target_group.public_backend : name => target_group.arn_suffix },
  )

  alarm_actions = [data.aws_sns_topic.operations.arn]
  runbook_base  = "https://github.com/genfeedai/genfeed.ai/blob/master/docs/operations/aws-monitoring.md"
}

# Reuse the existing topic because its operations email subscription is already
# confirmed. Creating a replacement topic would silently leave alarms without a
# recipient until somebody confirmed a new subscription.
data "aws_sns_topic" "operations" {
  name = "api-genfeed-ai"
}

# ── ALB availability, errors, and latency ───────────────────────────
resource "aws_cloudwatch_metric_alarm" "alb_healthy_hosts" {
  for_each = local.public_target_group_suffixes

  alarm_name          = "${local.name_prefix}-alb-${each.key}-healthy-hosts"
  alarm_description   = "${each.key} has no healthy ALB target. Runbook: ${local.runbook_base}#alb-target-health"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  metric_name         = "HealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Minimum"
  threshold           = 1
  treat_missing_data  = "breaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = each.value
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "alb_target_5xx" {
  for_each = local.public_target_group_suffixes

  alarm_name          = "${local.name_prefix}-alb-${each.key}-target-5xx"
  alarm_description   = "${each.key} returned at least five target 5xx responses in five minutes. Runbook: ${local.runbook_base}#alb-errors-and-latency"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = each.value
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "alb_target_latency" {
  for_each = local.public_target_group_suffixes

  alarm_name          = "${local.name_prefix}-alb-${each.key}-p95-latency"
  alarm_description   = "${each.key} p95 target response time exceeded two seconds for fifteen minutes. Runbook: ${local.runbook_base}#alb-errors-and-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  extended_statistic  = "p95"
  threshold           = 2
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = each.value
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "alb_target_connections" {
  for_each = local.public_target_group_suffixes

  alarm_name          = "${local.name_prefix}-alb-${each.key}-connection-errors"
  alarm_description   = "${each.key} had a target connection error. Runbook: ${local.runbook_base}#alb-errors-and-latency"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "TargetConnectionErrorCount"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = each.value
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
}

# ── ECS service availability and saturation ────────────────────────
resource "aws_cloudwatch_metric_alarm" "ecs_live_tasks" {
  for_each = local.active_services

  alarm_name          = "${local.name_prefix}-ecs-${each.key}-live-tasks"
  alarm_description   = "${each.key} has fewer live tasks than its desired count. Runbook: ${local.runbook_base}#ecs-service-health"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "LiveTaskCount"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Minimum"
  threshold           = each.value.desired
  treat_missing_data  = "breaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = each.key
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "ecs_cpu" {
  for_each = local.active_services

  alarm_name          = "${local.name_prefix}-ecs-${each.key}-cpu"
  alarm_description   = "${each.key} CPU utilization exceeded 80 percent for fifteen minutes. Runbook: ${local.runbook_base}#ecs-service-health"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "breaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = each.key
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "ecs_memory" {
  for_each = local.active_services

  alarm_name          = "${local.name_prefix}-ecs-${each.key}-memory"
  alarm_description   = "${each.key} memory utilization exceeded 80 percent for fifteen minutes. Runbook: ${local.runbook_base}#ecs-service-health"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "breaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = each.key
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
}

# ── RDS PostgreSQL capacity and latency ─────────────────────────────
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.name_prefix}-rds-cpu"
  alarm_description   = "RDS CPU utilization exceeded 80 percent for fifteen minutes. Runbook: ${local.runbook_base}#rds-postgresql"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "breaching"
  dimensions          = { DBInstanceIdentifier = data.aws_db_instance.genfeed.id }
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  alarm_name          = "${local.name_prefix}-rds-free-storage"
  alarm_description   = "RDS free storage fell below 5 GiB. Runbook: ${local.runbook_base}#rds-postgresql"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Minimum"
  threshold           = 5 * 1024 * 1024 * 1024
  treat_missing_data  = "breaching"
  dimensions          = { DBInstanceIdentifier = data.aws_db_instance.genfeed.id }
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "rds_freeable_memory" {
  alarm_name          = "${local.name_prefix}-rds-freeable-memory"
  alarm_description   = "RDS freeable memory fell below 128 MiB. Runbook: ${local.runbook_base}#rds-postgresql"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "FreeableMemory"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Minimum"
  threshold           = 128 * 1024 * 1024
  treat_missing_data  = "breaching"
  dimensions          = { DBInstanceIdentifier = data.aws_db_instance.genfeed.id }
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${local.name_prefix}-rds-connections"
  alarm_description   = "RDS connections exceeded 80. Runbook: ${local.runbook_base}#rds-postgresql"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Maximum"
  threshold           = 80
  treat_missing_data  = "breaching"
  dimensions          = { DBInstanceIdentifier = data.aws_db_instance.genfeed.id }
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "rds_read_latency" {
  alarm_name          = "${local.name_prefix}-rds-read-latency"
  alarm_description   = "RDS read latency exceeded 50 ms for fifteen minutes. Runbook: ${local.runbook_base}#rds-postgresql"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "ReadLatency"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 0.05
  treat_missing_data  = "notBreaching"
  dimensions          = { DBInstanceIdentifier = data.aws_db_instance.genfeed.id }
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "rds_write_latency" {
  alarm_name          = "${local.name_prefix}-rds-write-latency"
  alarm_description   = "RDS write latency exceeded 50 ms for fifteen minutes. Runbook: ${local.runbook_base}#rds-postgresql"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "WriteLatency"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 0.05
  treat_missing_data  = "notBreaching"
  dimensions          = { DBInstanceIdentifier = data.aws_db_instance.genfeed.id }
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# ── Redis/BullMQ backing store ──────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${local.name_prefix}-redis-memory"
  alarm_description   = "Redis database memory usage exceeded 80 percent. Runbook: ${local.runbook_base}#redis-and-bullmq"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Maximum"
  threshold           = 80
  treat_missing_data  = "breaching"
  dimensions          = { CacheClusterId = one(aws_elasticache_replication_group.redis.member_clusters) }
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${local.name_prefix}-redis-engine-cpu"
  alarm_description   = "Redis engine CPU utilization exceeded 80 percent for fifteen minutes. Runbook: ${local.runbook_base}#redis-and-bullmq"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "EngineCPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "breaching"
  dimensions          = { CacheClusterId = one(aws_elasticache_replication_group.redis.member_clusters) }
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "redis_evictions" {
  alarm_name          = "${local.name_prefix}-redis-evictions"
  alarm_description   = "Redis evicted one or more keys in five minutes. Runbook: ${local.runbook_base}#redis-and-bullmq"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Evictions"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  dimensions          = { CacheClusterId = one(aws_elasticache_replication_group.redis.member_clusters) }
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# ── Aggregate BullMQ health (seven fixed custom metrics) ───────────
resource "aws_cloudwatch_metric_alarm" "queue_metrics_heartbeat" {
  alarm_name          = "${local.name_prefix}-queues-heartbeat"
  alarm_description   = "Workers stopped publishing aggregate queue metrics for fifteen minutes. Runbook: ${local.runbook_base}#redis-and-bullmq"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "Heartbeat"
  namespace           = "Genfeed/Queues"
  period              = 300
  statistic           = "Minimum"
  threshold           = 1
  treat_missing_data  = "breaching"
  dimensions          = { Service = "workers" }
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "queue_waiting" {
  alarm_name          = "${local.name_prefix}-queues-waiting"
  alarm_description   = "Aggregate BullMQ waiting jobs exceeded 100 for fifteen minutes. Runbook: ${local.runbook_base}#redis-and-bullmq"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "WaitingJobs"
  namespace           = "Genfeed/Queues"
  period              = 300
  statistic           = "Maximum"
  threshold           = 100
  treat_missing_data  = "notBreaching"
  dimensions          = { Service = "workers" }
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "queue_oldest_waiting" {
  alarm_name          = "${local.name_prefix}-queues-oldest-waiting"
  alarm_description   = "The oldest waiting BullMQ job exceeded fifteen minutes for fifteen minutes. Runbook: ${local.runbook_base}#redis-and-bullmq"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  metric_name         = "OldestWaitingAgeSeconds"
  namespace           = "Genfeed/Queues"
  period              = 300
  statistic           = "Maximum"
  threshold           = 900
  treat_missing_data  = "notBreaching"
  dimensions          = { Service = "workers" }
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "queue_failed" {
  alarm_name          = "${local.name_prefix}-queues-failed"
  alarm_description   = "One or more BullMQ jobs failed in five minutes. Runbook: ${local.runbook_base}#redis-and-bullmq"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "FailedJobs5m"
  namespace           = "Genfeed/Queues"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  dimensions          = { Service = "workers" }
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "queue_stalled" {
  alarm_name          = "${local.name_prefix}-queues-stalled"
  alarm_description   = "One or more BullMQ jobs stalled in five minutes. Runbook: ${local.runbook_base}#redis-and-bullmq"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "StalledJobs5m"
  namespace           = "Genfeed/Queues"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  dimensions          = { Service = "workers" }
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# The dashboard references 43 metrics, below the 50-metric free-tier boundary.
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
              ["Genfeed/Queues", "ActiveJobs", "Service", "workers", { label = "Active", stat = "Maximum" }],
              ["Genfeed/Queues", "DelayedJobs", "Service", "workers", { label = "Delayed", stat = "Maximum" }],
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
          { name = "TargetConnectionErrorCount", title = "ALB target connection errors", stat = "Sum" },
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
