---
name: AWS operational monitoring decisions
description: Approach and cost decisions for issue #1 monitoring delivery
type: project
---

# AWS Operational Monitoring Decisions

## Approaches considered

### 1. CloudWatch standard metrics with bounded custom signals — selected

Uses the metrics ALB, ECS, RDS, ElastiCache, and EC2 already publish, one native production dashboard, static alarms, and only a few aggregate queue/GPU custom metrics. Account billing shows that free-tier offsets no longer apply, so the selected coverage is trimmed to an estimated USD 8.60/month while the fleet is stopped.

### 2. ECS Container Insights

Adds task- and container-level drill-down with minimal application work, but the published ECS pricing formula estimates roughly USD 40/month for the current five-service footprint. It remains an escalation option for a demonstrated container-level diagnostic gap.

### 3. Managed Prometheus plus Managed Grafana

Adds PromQL and cross-source dashboards, but introduces a second metric pipeline, per-sample/storage/query charges, and a minimum Grafana editor license. It remains optional until CloudWatch cannot support a documented query or dashboard workflow.

## Selected boundaries

- Dashboard: one custom production dashboard with 38 metric references; the private fleet console owns fleet visualization instead of a second USD 3/month CloudWatch dashboard.
- Alarms: standard resolution; no anomaly detection in the baseline.
- Alerts: reuse the confirmed production SNS topic instead of creating an email subscription requiring manual confirmation.
- ECS: dashboard all active services; alarm on ALB availability for public services, live tasks for internal services, and saturation for the API/workers.
- Queues: five aggregate metrics only; no per-queue or per-job dimensions, and one Redis marker per five-minute window prevents replica duplication.
- Fleet: private ownership, missing data ignored while stopped, custom GPU metrics published only while running.
- Cost: AWS Budget and anomaly thresholds are finalized after the follow-up account billing review; monitoring resources must remain independently attributable in Cost Explorer.

## Deferred decisions

- Container Insights enablement requires an incident-driven capability gap and a fresh cost estimate.
- Managed Prometheus/Grafana requires a PromQL or multi-source workflow that native CloudWatch cannot satisfy.
- RDS encryption and Redis resilience are separate infrastructure migrations.
