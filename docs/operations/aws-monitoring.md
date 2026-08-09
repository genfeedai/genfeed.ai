# AWS production monitoring

The `genfeed-production` CloudWatch dashboard and alarms are managed by
`infra/terraform/genfeed-prod/monitoring.tf`. They use standard AWS service
metrics and the existing operations SNS topic. Container Insights, Managed
Prometheus, and Managed Grafana are intentionally disabled at the current scale.

## Triage order

1. Confirm which resource and signal entered `ALARM` in CloudWatch.
2. Check whether the associated ECS deployment or infrastructure change is in progress.
3. Inspect the service's seven-day CloudWatch log group and its Sentry issues.
4. Restore availability before tuning capacity or alarm thresholds.
5. Record false positives and adjust only after comparing the metric history with the incident.

## ALB target health

- Open the affected target group and inspect registered target health reasons.
- Check the owning ECS service's desired, running, and pending task counts.
- Inspect the task's health endpoint and recent container logs.
- If a deploy caused the failure, use the ECS deployment circuit breaker's rollback result before forcing another deployment.

## ALB errors and latency

- Compare target 5xx, connection errors, response time, and request count over the same window.
- Inspect Sentry and the owning service log group for the first correlated exception or timeout.
- Check RDS and Redis saturation before scaling an application task.
- A missing error or latency metric during zero traffic is expected and does not alarm.

## ECS service health

- Compare live task count with the desired count in `infra/terraform/genfeed-prod/locals.tf`.
- Inspect stopped-task reasons and the primary deployment rollout state.
- For sustained CPU or memory pressure, verify request/queue load before changing the Fargate task size.
- Services configured with desired count zero are intentionally excluded from alarms.

## RDS PostgreSQL

- For storage pressure, identify table/index growth and verify automated backups before cleanup.
- For connection pressure, inspect application pool counts and long-running sessions.
- For CPU, memory, or latency pressure, correlate with Performance Insights before scaling.
- Do not change encryption, instance class, or storage configuration as an alarm-only response.

## Redis and BullMQ

- Evictions or high database memory require checking retained BullMQ jobs and queue cleanup settings.
- High engine CPU should be correlated with queue activity and command latency.
- Confirm workers are healthy before changing Redis capacity.
- One worker replica publishes each five-minute aggregate; the Redis marker expires automatically and is not a durable lock.
- Queue metrics must stay aggregate and must not add job, tenant, or content identifiers as dimensions.

## Missing telemetry

Required ECS, RDS, and Redis resources treat sustained missing telemetry as unhealthy.
Traffic-dependent ALB error and latency metrics treat missing data as no traffic. Intentionally
stopped fleet instances use non-breaching missing-data behavior in the private fleet monitoring stack.

## Cost boundary

- Keep the dashboard at or below 50 referenced metrics.
- Prefer standard AWS metrics over custom metrics.
- Do not enable Container Insights, Managed Prometheus, or Managed Grafana without documenting the capability gap and expected monthly cost.
- Review the `AmazonCloudWatch` Cost Explorer service monthly, grouped by usage type and operation.
