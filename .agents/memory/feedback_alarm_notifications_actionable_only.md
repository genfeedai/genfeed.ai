---
name: actionable_alarm_notifications
description: Production CloudWatch email is for actionable ALARM transitions, not recovery or deployment events
type: feedback
status: active
last_verified: 2026-08-12
topics: [aws, monitoring, cloudwatch, production, deployment]
---

**Rule:** Route production CloudWatch `ALARM` transitions to the operations SNS topic. Keep `OK` recovery transitions visible in CloudWatch without email delivery, and keep alarms active during deployments.

**Why:** Recovery actions doubled the email volume, while the original RDS freeable-memory threshold sat inside its steady-state range and caused repeated `ALARM`/`OK` flapping. Blanket deployment muting would hide the defects the alarms are meant to catch.

**How to apply:**
- Configure `alarm_actions` without `ok_actions` in `infra/terraform/genfeed-prod/monitoring.tf`.
- Use sustained evaluation windows and thresholds calibrated from production metric history.
- Treat deployment correlation as triage context, not as a reason to disable notification coverage.
- After instance sizing or workload changes, compare the metric distribution with incidents before recalibrating a capacity threshold.
