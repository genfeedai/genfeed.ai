# ADR: PLG Boundary Between OSS and Genfeed Cloud

## Status
Accepted

## Boundary Spec Version
v1.1.1

## Last Updated
2026-04-07

## Canonical Source
This file.

## Public Canonical URL
https://docs.genfeed.ai/product/core-cloud-boundary

## Decision Summary
Genfeed follows a hybrid OSS + SaaS model:

- The open-source repo is a complete self-hosted/BYOK workflow engine.
- Genfeed Cloud is the managed automation layer for outcomes at scale.
- PLG growth comes from convenience, orchestration, and distribution, not by crippling OSS basics.

## Product Boundary

| Capability | OSS (Self-Hosted) | Genfeed Cloud |
|---|---|---|
| Visual workflow builder | Yes | Yes |
| Local/self-hosted run | Yes | N/A |
| BYOK execution | Yes | Yes |
| Autonomous agent runs | No | Yes |
| Scheduling/cron orchestration | No | Yes |
| Social publishing connectors | Manual export/upload | Managed integrations |
| Cross-workflow analytics and optimization loops | Limited local insight | Full managed analytics |
| Team/org controls, billing, quotas | Enterprise only (`ee/`) | Yes |

## Non-Negotiables

1. OSS must remain useful without a Cloud account.
2. OSS must preserve workflow build and local/BYOK execution.
3. Cloud-only value should center on automation, publishing, scheduling, analytics, and collaboration.
4. Workflow portability between OSS and Cloud remains a required direction.

## Enterprise Multi-Tenancy

Multi-tenant organization controls are available via `ee/packages/` under commercial license. All multi-tenant data access code must live under `ee/` or import from `ee/packages/`.

## Version Bump Checklist

1. Update the ADR version and last-updated date.
2. Update the public docs page version/date at `docs/` if applicable.

## Revision Log

| Version | Date | Summary |
|---|---|---|
| v1.1.0 | 2026-03-11 | Initial accepted version |
| v1.1.1 | 2026-03-15 | Added CI check script, revision log |
