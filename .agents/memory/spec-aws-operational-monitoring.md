---
name: AWS operational monitoring specification
description: Cost-bounded CloudWatch coverage for the Genfeed production control plane
type: project
---

# AWS Operational Monitoring Spec

## Purpose

Provide actionable AWS production visibility without running monitoring servers on application or inference hosts. The baseline uses AWS service metrics already emitted by ALB, ECS, RDS, ElastiCache, and EC2, and adds custom metrics only for operational signals AWS cannot infer.

## Non-Goals

- Enable ECS Container Insights, Amazon Managed Service for Prometheus, or Amazon Managed Grafana.
- Replace Sentry error tracing or PostHog product analytics.
- Page on expected scale-to-zero services or intentionally stopped GPU instances.
- Add customer, tenant, job, or queue identifiers as metric dimensions.
- Change RDS encryption, Redis topology, or backup policy as part of monitoring delivery.

## Interfaces

- One `genfeed-production` CloudWatch dashboard in `us-west-1`, with no more than 50 referenced metrics.
- Standard-resolution CloudWatch `ALARM` transitions route to the existing confirmed operations SNS topic; `OK` transitions remain visible in CloudWatch without email delivery.
- Dashboard and alarm resources are managed by the existing OpenTofu production stack.
- Application metrics use the `Genfeed/Queues` namespace and a fixed, aggregate dimension set.
- A five-minute Redis marker elects one worker replica to publish each queue snapshot.
- Fleet metrics and alarms remain in private operational infrastructure and publish only while an instance is running.

## Key Decisions

- Use standard AWS metrics first; they carry no custom metric storage charge.
- Keep the account-specific baseline incremental monitoring target below USD 9/month while GPU instances are stopped.
- Use static thresholds initially; anomaly-detection alarms cost three alarm metrics each and the existing ones never received data.
- Treat missing data as breaching only for resources expected to be continuously available. Treat it as non-breaching for expected-zero traffic and stopped fleet instances.
- Bound custom metrics to aggregate queue health and fleet host/GPU health; never dimension by job, tenant, or content.

## Edge Cases and Failure Modes

- Parked ECS services have desired count zero and must not create availability or utilization alarms.
- ALB error and latency metrics may be absent during zero traffic and must not page.
- ECS deploy transitions may briefly reduce samples; alarms require sustained breaches.
- Deployments do not mute alarms; sustained evaluation windows distinguish normal rollout churn from an actionable breach.
- An intentionally stopped fleet instance must remain silent, while EC2 status failures on a running instance must alarm.
- Notification delivery continues through the existing confirmed SNS topic; the stack must not create an unconfirmed replacement subscription.
- Dashboard metric count must remain within the free-tier allowance as services are added.

## Acceptance Criteria

- WHEN an ALB target group has no healthy target for two consecutive periods THE SYSTEM SHALL notify operations.
- WHEN the API or workers sustain CPU or memory utilization above 80 percent THE SYSTEM SHALL notify operations.
- WHEN an internal files or workers service stops reporting its expected live task count THE SYSTEM SHALL represent it as unavailable; public service availability is covered by ALB target health.
- WHEN RDS or Redis crosses an approved capacity threshold THE SYSTEM SHALL notify operations with the resource identity.
- WHEN a metric alarm recovers THE SYSTEM SHALL record its `OK` state in CloudWatch without sending a recovery email.
- WHEN an intentionally parked ECS service or stopped fleet instance publishes no telemetry THE SYSTEM SHALL remain non-alarming.
- WHEN an operator opens the production dashboard THE SYSTEM SHALL show availability, latency, errors, task health, CPU, memory, database, and cache pressure using no more than 50 metrics.
- WHERE queue metrics are emitted THE SYSTEM SHALL use fixed aggregate dimensions and no customer-controlled label values.
- WHEN multiple worker replicas are running THE SYSTEM SHALL publish no more than one aggregate queue snapshot per five-minute window.
- THE SYSTEM SHALL keep Container Insights, Managed Prometheus, and Managed Grafana disabled.

## Test Plan

- Run `tofu fmt -check -recursive infra/terraform`.
- Run static repository guards and secret scanning allowed on the MacBook.
- Let pull-request CI run OpenTofu validation and any application test/typecheck/build gates.
- After merge and production apply, inspect dashboard metric count, alarm state, and SNS actions through read-only AWS APIs.
- Trigger one controlled non-production threshold breach before closing issue #1.
