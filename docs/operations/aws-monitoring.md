# AWS production monitoring

The `genfeed-production` CloudWatch dashboard is managed by
`infra/terraform/genfeed-prod/monitoring.tf` and uses standard AWS service
metrics. Production CloudWatch alarms are operational AWS resources and are not
provisioned or configured by this public repository. Container Insights,
Managed Prometheus, and Managed Grafana are intentionally disabled at the
current scale.

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

## ECS service health

- Compare live task count with the desired count in `infra/terraform/genfeed-prod/locals.tf`.
- Inspect stopped-task reasons and the primary deployment rollout state.
- For sustained CPU or memory pressure, verify request/queue load before changing the Fargate task size.

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

### Queue health snapshots and alerts

The workers service evaluates every name in `ALL_QUEUE_NAMES` every five
minutes. The five CloudWatch metrics remain aggregate; per-queue metadata is
stored in Redis under `genfeed:monitoring:queue-health:snapshot:<queue>` with a
15-minute TTL so it does not add CloudWatch dimensions or durable history.

Configure the global per-queue limits with:

- `QUEUE_HEALTH_MAX_WAITING` (default `100`)
- `QUEUE_HEALTH_MAX_OLDEST_WAITING_MINUTES` (default `15`)
- `QUEUE_HEALTH_MAX_FAILED` (default `25`)
- `QUEUE_HEALTH_ALERT_THROTTLE_MINUTES` (default `60`)
- `QUEUE_HEALTH_ALERT_WEBHOOK_URL` (optional HTTPS Slack-compatible incoming webhook)

The first breach is logged and optionally posted to the webhook. Repeated
alerts are throttled per queue and incident in Redis, so worker restarts or
replica changes do not reset the throttle. A delivered incident emits one
recovery notice when all thresholds clear. Notifications contain only queue
name, counts, age, thresholds, and timestamps; they never contain jobs,
failure reasons, tenant identifiers, webhook credentials, or content.

If one queue or the webhook transport fails, the sweep continues for the other
queues and still attempts the fixed aggregate CloudWatch publish. Investigate
the workers log for `Queue health processing failed` before changing a
threshold.

## Cost boundary

- Keep the production dashboard at or below 50 referenced metrics; the current definition uses 38.
- Prefer standard AWS metrics over custom metrics.
- Do not enable Container Insights, Managed Prometheus, or Managed Grafana without documenting the capability gap and expected monthly cost.
- Review the `AmazonCloudWatch` Cost Explorer service monthly, grouped by usage type and operation.
- Alarm and fleet monitoring costs are reviewed with the operational AWS resources rather than specified in this public stack.
