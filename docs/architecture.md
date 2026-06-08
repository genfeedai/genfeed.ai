# Architecture

Genfeed.ai uses a hybrid OSS Core plus Genfeed Cloud model. Core is the
self-hosted, single-tenant runtime; Cloud is the managed automation,
collaboration, and governance layer.

## Boundary Documents

- [Core and Cloud Execution Boundaries](./execution-boundaries.md)
- [PLG Boundary ADR](../.agents/memory/architecture/ADR-PLG-BOUNDARY-OSS-CLOUD.md)
- [Skills, Routines, and Memory Boundary ADR](../.agents/memory/architecture/ADR-SKILLS-ROUTINES-MEMORY-BOUNDARY.md)
- [Open-Source and Enterprise Context](../.agents/memory/system/OPEN-SOURCE-CONTEXT.md)

## Boundary Summary

| Capability                                    | OSS Core                           | Genfeed Cloud / Enterprise    |
| --------------------------------------------- | ---------------------------------- | ----------------------------- |
| Local setup and self-hosted storage           | Yes                                | N/A                           |
| Workflow authoring and local/BYOK execution   | Yes                                | Yes                           |
| Managed inference credits                     | Optional explicit Cloud API bridge | Yes                           |
| Skill model and local skill attachment        | Yes                                | Yes, with governance          |
| Routine engine and workflow-backed scheduling | Yes                                | Yes, with hosted operations   |
| Personal feedback memory and retrieval        | Yes                                | Yes, plus governed org memory |
| Team review queue, comments, approvals        | No                                 | Yes                           |
| Skill promotion from feedback                 | No                                 | Yes                           |
| Social publishing connectors                  | Manual export/upload               | Managed integrations          |
| Cross-workflow analytics and optimization     | Limited local insight              | Full managed analytics        |
| Multi-tenant org controls, billing, quotas    | Enterprise only under `ee/`        | Yes                           |

## Core Rules

- Core remains useful without a Cloud account.
- Personal feedback memory stays local unless the user explicitly promotes it.
- New recurring product automation is workflow-backed, not generic cron
  scheduling.
- Collaborative memory, shared review, approval workflows, and team governance are
  Cloud or Enterprise surfaces.

## License

The repository root is AGPL-3.0. Enterprise code under `ee/` uses the commercial
license in `ee/LICENSE`.
