---
name: AWS operational monitoring decisions
description: Approach and cost decisions for issue #1 monitoring delivery
type: project
---

# AWS Operational Monitoring Decisions

## Approaches considered

### 1. CloudWatch standard metrics with bounded custom signals — selected

Uses the metrics ALB, ECS, RDS, ElastiCache, and EC2 already publish, one native dashboard, static alarms, and only a few aggregate queue/GPU custom metrics. This is the smallest operational surface, uses the existing OpenTofu stack, and targets less than USD 5/month incremental cost while the fleet is stopped.

### 2. ECS Container Insights

Adds task- and container-level drill-down with minimal application work, but the published ECS pricing formula estimates roughly USD 40/month for the current five-service footprint. It remains an escalation option for a demonstrated container-level diagnostic gap.

### 3. Managed Prometheus plus Managed Grafana

Adds PromQL and cross-source dashboards, but introduces a second metric pipeline, per-sample/storage/query charges, and a minimum Grafana editor license. It remains optional until CloudWatch cannot support a documented query or dashboard workflow.

## Selected boundaries

- Dashboard: one custom dashboard, at most 50 metric references.
- Alarms: standard resolution; no anomaly detection in the baseline.
- Alerts: reuse the confirmed production SNS topic instead of creating an email subscription requiring manual confirmation.
- ECS: monitor only services whose desired count is greater than zero.
- Queues: aggregate health only; no per-queue or per-job dimensions in the initial baseline, and one Redis marker per five-minute window prevents replica duplication.
- Fleet: private ownership, missing data ignored while stopped, custom GPU metrics published only while running.
- Cost: AWS Budget and anomaly thresholds are finalized after the follow-up account billing review; monitoring resources must remain independently attributable in Cost Explorer.

## Deferred decisions

- Container Insights enablement requires an incident-driven capability gap and a fresh cost estimate.
- Managed Prometheus/Grafana requires a PromQL or multi-source workflow that native CloudWatch cannot satisfy.
- RDS encryption and Redis resilience are separate infrastructure migrations.
