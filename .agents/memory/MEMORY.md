# Memory Index

## Project State

- [Project Overview](project_overview.md) — Genfeed.ai monorepo structure and key context
- [One API Epic](project_one_api_epic.md) — Epic #95: consolidate self-hosted + cloud into one NestJS API, 20 issues, 8 phases
- [Fallow Health](project_fallow.md) — Fallow codebase health analysis (#83), weekly CI, score 72/100
- [BullMQ Refactor](project_bullmq.md) — 32 @Processor decorators in API need moving to Workers (#84)
- [Migration Status](project_migration.md) — cloud + core → genfeed.ai migration complete, all pages/tests present
- [Settings Routing](project_settings_routing.md) — canonical personal/org/brand settings URL shapes
- [Desktop BYOK Generation](project_desktop_byok_generation.md) — desktop local/BYOK generation works without Clerk; Clerk is sync-only
- [TS6.0/Prisma-7 build regression](project_ts6_prisma7_build_regression.md) — **BUILD REGRESSION RESOLVED 2026-06-03** (develop CI green @ 2e66b0aa8). Root cause was stale turbo cache + mv-dist-src hack, not ~2020 real errors; removed the hack + fixed ~7 Prisma-7 Document interfaces. Stage 4 + migration-apply still pending.

## Feedback (user corrections — permanent)

- [Never lose code](feedback_never_lose_code.md) — Always branch+push WIP before destructive git ops
- [Never commit/push to master](feedback_never_commit_to_master.md) — Feature branches: commit freely. Master: always ask.
- [proxy.ts is middleware](feedback_proxy_middleware.md) — Next.js 16 renamed middleware.ts → proxy.ts
- [Use @ui/primitives](feedback_ui_primitives.md) — Never raw HTML elements — blocked by lint-no-raw-html.sh
- [Codex adversarial review](feedback_codex_adversarial_review.md) — MANDATORY before ExitPlanMode
- [GitHub issue worktree workflow](feedback_gh_issue_worktree_workflow.md) — Assigned issues use worktrees from develop
- [No external symlinks](feedback_no_external_symlinks.md) — Open source repo. Internal symlinks only.
- [End-to-end implementation](feedback_end_to_end_implementation.md) — Never ship half-architecture; wire the full user path
- [P0 status, not label](feedback_p0_status_not_label.md) — P0 is issue status; never create priority labels
- [No issue-body frontmatter](feedback_no_issue_body_frontmatter.md) — GitHub issue PRDs use native project fields for metadata; never add YAML frontmatter to issue bodies
- [Skill boundary](feedback_skill_boundary.md) — .agents/skills are repo-build skills; root skills/ are Genfeed product content skills
- [GPU instances off by default](feedback_gpu_instances_off_by_default.md) — Keep Genfeed GPU/Fleet inference instances off unless explicitly needed
- [Inference servers private boundary](feedback_inference_servers_private_boundary.md) — Keep Genfeed inference server implementations out of the public monorepo
- [GenfeedAI managed provider](feedback_genfeedai_managed_provider.md) — Model Genfeed-managed inference as provider=genfeedai, enabled per customer from console
- [Concurrent automation on develop](feedback_concurrent_automation_develop.md) — A background bot commits to HEAD + pushes develop in this shared checkout; path-scope git add, never blind add -u
- [Genfeed project kanban](feedback_genfeed_project_kanban.md) — Use project #12 Genfeed.ai as canonical; never select work from closed Mission Control #11
- [Production deploys master-only](feedback_production_deploy_master_only.md) — Never deploy develop/staging to production unless Vincent explicitly overrides; production deploys run from GitHub CI on master

## References

- [MongoDB Atlas URI](reference_mongodb_atlas.md) — Atlas connection string for `cloud` DB
- [Postgres RDS](reference_postgres_rds.md) — prod `genfeed-data` + dev `local-genfeedai` instances, sslmode gotcha, PrismaService env path
- [Production EC2](reference_prod_ec2.md) — api.genfeed.ai box: t3a.large, EIP, SSH key, deploy mechanics, never-bulk-restart + Tailscale-DNS gotchas, stale Vercel projects

## Context (loaded via CLAUDE.md @import)

- [System Patterns](context/system-patterns.md) — architecture patterns, serializers, multi-tenancy
- [Project Structure](context/project-structure.md) — directory layout, 12 backend services, 6 frontends
- [Style Guide](context/project-style-guide.md) — TypeScript, git, formatting, naming conventions
- [Skills Architecture](context/skills-architecture.md) — skills/ vs .agents/skills/ vs .claude/skills/
- [Progress](context/progress.md) — migration status, active work areas
- [Product Context](context/product-context.md) — what Genfeed.ai is and does
- [Project Overview](context/project-overview.md) — high-level project summary
- [Project Brief](context/project-brief.md) — project brief
- [Project Vision](context/project-vision.md) — long-term vision
- [Tech Context](context/tech-context.md) — technology stack details
- [E2E Architecture](context/e2e-architecture.md) — GitHub Actions e2e pipeline (4 jobs), Playwright + API E2E layers, triggers, DB provisioning, known debt

## Features

- [Agent Architecture](features/agent/README.md) — orchestration, threading, collections, tools, frontend

## System

- [Agent Runtime](system/AGENT-RUNTIME.md) — task loop, verification, completion gate
- [Critical Never Do](system/CRITICAL-NEVER-DO.md) — production-breaking violations
- [System Rules](system/SYSTEM-RULES.md) — coding standards
- [Priority Reading](system/PRIORITY-READING.md) — what to read first
- [Cross-Project Rules](system/CROSS-PROJECT-RULES.md) — rules shared across repos
- [Open Source Context](system/OPEN-SOURCE-CONTEXT.md) — OSS licensing, contribution
- [Self-Hosted Guide](system/SELF-HOSTED-GUIDE.md) — Docker deployment guide

## Plans (UI design outputs)

- **MergedSwitcher** (2026-05-17) — Merged AppSwitcher + ContentTypeSwitcher. Generate section: 4×2 colored icon grid (GenerationType enum). Navigate section: 2-col grid (Overview, Workflows, Library, Calendar, Analytics). Component: `packages/ui/src/components/shell/merged-switcher/MergedSwitcher.tsx`. HTML mockups gitignored under `.agents/plans/`.

## Architecture Decisions

- [Dynamic Scheduling](architecture/ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL.md) — scheduling via workflow engine
- [PLG Boundary](architecture/ADR-PLG-BOUNDARY-OSS-CLOUD.md) — OSS vs cloud feature split
- [Workflow-Backed Agents](architecture/ADR-WORKFLOW-BACKED-RECURRING-AGENT-AUTOMATION.md) — recurring agent automation
- [Skills, Routines, and Memory Boundary](architecture/ADR-SKILLS-ROUTINES-MEMORY-BOUNDARY.md) — OSS single-player loop vs cloud collaborative governance

## Rules (symlinked to .claude/rules/)

- [Security](rules/00-security.md) — secret isolation, no outbound HTTP
- [Backend Services](rules/10-backend-services.md) — soft deletes, service boundaries
- [Web Apps](rules/20-web-apps.md) — semantic UI, async cancellation
- [Shared Packages](rules/30-shared-packages.md) — strict types, canonical locations
