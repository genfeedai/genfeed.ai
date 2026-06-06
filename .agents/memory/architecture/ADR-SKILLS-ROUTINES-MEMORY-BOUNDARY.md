# ADR: Skills, Routines, And Memory Boundary

## Status

Accepted

## Boundary Spec Version

v1.0.0

## Last Updated

2026-06-02

## Canonical Source

This file.

## Decision Summary

Genfeed keeps the single-player skill, routine, and personal memory loop in OSS
Core. Genfeed Cloud and Enterprise own collaborative governance, team review, and
shared learning surfaces.

This boundary exists to preserve OSS value without leaking the collaborative moat
into the open-source package.

## Product Boundary

| Capability                                         | OSS Core                                                              | Genfeed Cloud / Enterprise                                   |
| -------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| Skill model and runtime                            | Define, validate, attach, and execute local skills                    | Managed distribution, governance, and team controls          |
| Brand/local skill attachment                       | Per-brand local skill library and CRUD                                | Org-wide skill libraries and policy controls                 |
| Workflow/routine engine                            | Create, edit, execute, import, and export routines locally            | Managed orchestration, hosted execution, and team operations |
| Workflow-backed local scheduling                   | Recurring routine triggers through the workflow engine                | Hosted scheduled runs, SLAs, and operational monitoring      |
| Local/personal feedback memory                     | Store user corrections, style preferences, and local learned patterns | Optional promotion into governed org memory                  |
| Pre-generation feedback retrieval                  | Retrieve local/personal memory before generation                      | Retrieve governed org memory and team-approved patterns      |
| Shared team review queue                           | No                                                                    | Yes                                                          |
| Comments, approvals, and requested changes         | No                                                                    | Yes                                                          |
| Reviewer assignment                                | No                                                                    | Yes                                                          |
| Org-shared memory and learned pattern governance   | No                                                                    | Yes                                                          |
| Promotion of feedback into shared skills           | No                                                                    | Yes                                                          |
| Admin controls, auditability, moderation, rollback | Local-only basics where needed                                        | Yes                                                          |

## Ambiguous Areas

| Area                            | Decision                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| Skill marketplace and discovery | Cloud-only because distribution, moderation, and trust require managed infrastructure    |
| Skill versioning                | OSS supports local versioning; Cloud adds org-wide version governance                    |
| Routine templates               | OSS supports local templates; Cloud adds shared org template libraries                   |
| Cross-brand memory              | OSS is per-brand or personal only; Cloud enables cross-brand memory with org governance  |
| Feedback export/import          | OSS may export/import local memory; Cloud governs promotion into shared memory or skills |

## Epic #220 Issue Mapping

| Issue                                                                                             | Boundary                   | Rationale                                                               |
| ------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| #221 `feat(skills): make skills first-class product objects in Genfeed.ai`                        | OSS Core                   | First-class local skills are part of the single-player engine           |
| #222 `feat(content-engine): build feedback memory adapter from tasks, reviews, and outcome notes` | OSS Core                   | Local feedback ingestion feeds personal memory                          |
| #223 `feat(agent-orchestrator): retrieve and explain feedback memory before generation`           | OSS Core                   | Pre-generation retrieval is part of the local generation loop           |
| #224 `feat(workflows): ship productized Daily Trend Loop and Release Loop routines`               | OSS Core                   | Routine authoring and workflow-backed scheduling stay available locally |
| #225 `feat(ee): collaborative review queue, comments, and approvals for content ops teams`        | Genfeed Cloud / Enterprise | Team review, approvals, and assignments are collaborative governance    |
| #226 `feat(ee): shared org memory + governance for learned skills and feedback patterns`          | Genfeed Cloud / Enterprise | Org-shared memory and skill promotion require governance controls       |

## Non-Negotiables

1. OSS must have a fully functional single-player skill, routine, and memory loop
   without Genfeed Cloud.
2. Collaborative features, including shared review, org memory, reviewer
   assignment, comments, approvals, and skill promotion, require Enterprise or
   Genfeed Cloud.
3. Personal feedback memory never leaves the local deployment unless explicitly
   promoted by the user.
4. New recurring product automation must remain workflow-backed, not generic
   cron scheduling.

## Related ADRs

- `ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL.md` - workflow-backed scheduling is
  the canonical direction for recurring automation.
- `ADR-PLG-BOUNDARY-OSS-CLOUD.md` - parent OSS/Core versus Genfeed Cloud product
  boundary.
- `ADR-WORKFLOW-BACKED-RECURRING-AGENT-AUTOMATION.md` - narrow rule for
  recurring agent automation.

## Version Bump Checklist

1. Update the ADR version and last-updated date.
2. Update `ADR-PLG-BOUNDARY-OSS-CLOUD.md` if the parent boundary changes.
3. Update `.agents/memory/system/OPEN-SOURCE-CONTEXT.md` and
   `docs/architecture.md` if contributor-facing guidance changes.

## Revision Log

| Version | Date       | Summary                                                                                     |
| ------- | ---------- | ------------------------------------------------------------------------------------------- |
| v1.0.0  | 2026-06-02 | Initial accepted boundary for skills, routines, feedback memory, and collaborative learning |
