# ADR: PLG Boundary Between OSS and Genfeed Cloud

## Status

Accepted

## Boundary Spec Version

v1.3.1

## Last Updated

2026-07-06

## Canonical Source

This file.

## Public Canonical URL

https://docs.genfeed.ai/core/execution-boundaries

## Decision Summary

Genfeed follows a hybrid OSS + SaaS model:

- The open-source repo is a complete self-hosted/BYOK workflow engine.
- Genfeed Cloud is the managed automation layer for outcomes at scale.
- PLG growth comes from convenience, orchestration, and distribution, not by crippling OSS basics.

## Product Boundary

| Capability                                      | OSS (Self-Hosted)         | Genfeed Cloud          |
| ----------------------------------------------- | ------------------------- | ---------------------- |
| Visual workflow builder                         | Yes                       | Yes                    |
| Local/self-hosted run                           | Yes                       | N/A                    |
| BYOK execution                                  | Yes                       | Yes                    |
| Managed inference credits                       | Optional Cloud API bridge | Yes                    |
| Autonomous agent runs                           | No                        | Yes                    |
| Scheduling/cron orchestration                   | No                        | Yes                    |
| Social publishing connectors                    | Manual export/upload      | Managed integrations   |
| Cross-workflow analytics and optimization loops | Limited local insight     | Full managed analytics |
| Team/org controls, billing, quotas              | Enterprise only (`ee/`)   | Yes                    |
| Skill model and local attachment                | Yes                       | Yes                    |
| Personal feedback memory                        | Yes                       | Yes                    |
| Routine engine and workflow-backed scheduling   | Yes                       | Yes                    |
| Shared review queue and collaborative memory    | No                        | Yes                    |

## Non-Negotiables

1. OSS must remain useful without a Cloud account.
2. OSS must preserve workflow build and local/BYOK execution.
3. Cloud-only value should center on automation, publishing, scheduling, analytics, and collaboration.
4. Workflow portability between OSS and Cloud remains a required direction.
5. Cloud account sync is explicit. Core local records do not replicate to Cloud without a dedicated import, export, or API action.

## Enterprise Multi-Tenancy

Multi-tenant organization controls are a SaaS/EE product boundary. Current implementation after #1093 keeps deployment-mode-agnostic org enforcement in the OSS API (`CombinedAuthGuard`, request context, inline `organizationId` filters); there is no separable `ee/packages/multi-tenancy` package. Commercial-only entitlements, billing, quotas, and advanced org controls remain in `ee/`.

## Related ADRs

- `ADR-SKILLS-ROUTINES-MEMORY-BOUNDARY.md` - canonical boundary for skills,
  routines, personal feedback memory, shared review, and collaborative learning.
- `ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL.md` - workflow-backed scheduling is
  the canonical scheduling model for new product automation.

## Version Bump Checklist

1. Update the ADR version and last-updated date.
2. Update the public docs page version/date at `docs/` if applicable.

## Revision Log

| Version | Date       | Summary                                                                                |
| ------- | ---------- | -------------------------------------------------------------------------------------- |
| v1.1.0  | 2026-03-11 | Initial accepted version                                                               |
| v1.1.1  | 2026-03-15 | Added CI check script, revision log                                                    |
| v1.2.0  | 2026-05-03 | Added V1 execution modes, account-sync contract, and managed inference bridge boundary |
| v1.3.0  | 2026-06-02 | Added skills, routines, feedback memory, and collaborative learning boundary summary   |
| v1.3.1  | 2026-07-06 | Aligned multi-tenancy text with #1093 OSS API enforcement boundary                     |
