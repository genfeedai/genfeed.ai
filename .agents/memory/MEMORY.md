# Memory Index

## Project State

- [Project Overview](project_overview.md) — Genfeed.ai monorepo structure and key context
- [One API Epic](project_one_api_epic.md) — Epic #95: consolidate self-hosted + cloud into one NestJS API, 20 issues, 8 phases
- [Fallow Health](project_fallow.md) — Fallow codebase health analysis (#83), weekly CI, score 72/100
- [BullMQ Processor Placement](project_bullmq.md) — API no longer owns BullMQ processors; add new processors to workers or the owning runtime service
- [Backend type-check pattern](project_backend_typecheck.md) — dedicated `tsconfig.typecheck.json` per `apps/server/*` (never the runtime config); shared base, `useDefineForClassFields:false`, cross-app `$TURBO_ROOT$` inputs. 10/12 green (#1148); notifications+files follow-ups on #1145
- [Migration Status](project_migration.md) — cloud + core → genfeed.ai migration complete, all pages/tests present
- [Settings Routing](project_settings_routing.md) — canonical personal/org/brand settings URL shapes
- [Desktop BYOK Generation](project_desktop_byok_generation.md) — desktop local/BYOK generation is local-first; cloud connect is optional
- [TS6.0/Prisma-7 build regression](project_ts6_prisma7_build_regression.md) — **BUILD REGRESSION RESOLVED 2026-06-03** (CI green @ 2e66b0aa8). Root cause was outdated turbo cache + mv-dist-src hack, not ~2020 real errors; removed the hack + fixed ~7 Prisma-7 Document interfaces. Stage 4 + migration-apply still pending.
- **Deployment Modes & Auth Baseline (2026-06-29)** — canonical 3-mode model (SaaS / Community / Desktop as `deployment × client` axes) locked in [ADR-DEPLOYMENT-MODES](architecture/ADR-DEPLOYMENT-MODES.md). Better Auth is now the active auth baseline across modes after #769/#866; platform admin access uses `users.platformRole`; headless API keys remain tracked under #747/#878. Multi-tenancy stays EE/SaaS; managed credits cloud-only; Community = funnel charter. Supersedes the auth half of #95.

## Rules (user corrections — permanent)

- [Never lose code](never_lose_code.md) — Always branch+push WIP before destructive git ops
- [Trunk PR workflow](trunk_pr_workflow.md) — Trunk-based: commit/push/PR on short-lived branches; master is PR-only; secret-scan every commit.
- [proxy.ts is middleware](proxy_middleware.md) — Next.js 16 renamed middleware.ts → proxy.ts
- [Use @ui/primitives](ui_primitives.md) — Never raw HTML elements — blocked by lint-no-raw-html.sh
- [Codex adversarial review](codex_adversarial_review.md) — MANDATORY before ExitPlanMode
- [GitHub issue worktree workflow](gh_issue_worktree_workflow.md) — Assigned issues use worktrees from master → PR to master
- [Ready PRs by default](ready_pr_default.md) — Open normal ready PRs to master by default; draft only by explicit request or blocked WIP
- [No external symlinks](no_external_symlinks.md) — Open source repo. Internal symlinks only.
- [End-to-end implementation](end_to_end_implementation.md) — Never ship half-architecture; wire the full user path
- [P0 priority field](p0_priority_not_label.md) — P0/P1/P2/P3 live in Project #12 Priority; no priority labels
- [No issue-body frontmatter](no_issue_body_frontmatter.md) — GitHub issue PRDs use native project fields for metadata; never add YAML frontmatter to issue bodies
- [Skill boundary](skill_boundary.md) — .agents/skills are repo-build skills; root skills/ are Genfeed product content skills
- [GPU instances off by default](gpu_instances_off_by_default.md) — Keep Genfeed GPU/Fleet inference instances off unless explicitly needed
- [Inference servers private boundary](inference_servers_private_boundary.md) — Keep Genfeed inference server implementations out of the public monorepo
- [GenfeedAI managed provider](genfeedai_managed_provider.md) — Model Genfeed-managed inference as provider=genfeedai, enabled per customer from console
- [Console managed inference control plane](console_managed_inference_control_plane.md) — Private console owns Genfeed-managed Fleet/model/customer assignment
- [Shared checkout automation](shared_checkout_automation.md) — Treat shared checkout state as moving; path-scope git add
- [Genfeed project kanban](genfeed_project_kanban.md) — Use project #12 Genfeed.ai as canonical
- [System Workflows Content OS](system_workflows_content_os.md) — Content automation uses immutable system workflows instead of hard-coded publish/action/cron paths
- [Positive memory framing](positive_memory_framing.md) — Write memory as target-state guidance with active sources of truth
- [Epic status on child start](epic_status_on_child_start.md) — Move parent epics to In Progress as soon as a child starts
- [Failed deploys never burn a version](release_tag_after_green_deploy.md) — pre-gate release cutting is normal; on deploy failure fix master and re-cut the SAME version (delete unconsumed tag), never bump
- [Production deploys master-only](production_deploy_master_only.md) — Never deploy any non-master ref to production unless Vincent explicitly overrides; production deploys run from GitHub CI on master
- [Vercel release gate](feedback_vercel_release_gate.md) — SaaS Vercel frontends deploy only through the API-first production release workflow; Vercel Git auto-deploy stays disabled
- [PRD-pass verify state first](prd_pass_verify_state_first.md) — On any epic PRD pass, verify child issue states via `gh` + audit real code before trusting the epic body; never rewrite closed/shipped cards
- [Prisma legacy alias fields](rules/prisma_legacy_alias_fields.md) — Mongo-era `*Document` aliases (`organization`/`user`/`_id`) are undefined on Prisma rows; read scalar FKs (`organizationId`/`userId`); `BaseService.findOne` guards empty ids (canonical: docs/identity-resolution.md)
- [NestJS value imports for DI](rules/nestjs_value_imports_for_di.md) — never `import type` classes used in decorator metadata (constructor DI, `@Body`/`@Query`/`@Param` DTOs); emitDecoratorMetadata erases them → DI injects undefined / validation silently skips; guarded by `check:di-value-imports` in CI

## References

- [Postgres RDS](reference_postgres_rds.md) — prod `genfeed-data` + dev `local-genfeedai` instances, sslmode gotcha, PrismaService env path
- [Production AWS Runtime](reference_prod_aws_runtime.md) — live AWS source of truth: ECS/Fargate production, AL2023 EC2 stopped as rollback host, community deploy unaffected
- [Production Fargate + Vercel webhook](reference_production_fargate_vercel_webhook.md) — live ECS service state, Vercel webhook receiver, Discord notification sink disabled, correct webhook reset scope
- [Skills Source Repos](reference_skills_source_repos.md) — free product skills come from `genfeedai/skills`; paid Skills Pro comes from private `genfeedai/skills-pro`

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
- [E2E Architecture](context/e2e-architecture.md) — GitHub Actions E2E pipeline, API boot gate, sharded Playwright suite, triggers, DB provisioning, known debt

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
- [Deployment Modes & Auth](architecture/ADR-DEPLOYMENT-MODES.md) — 3 product modes (SaaS/Community/Desktop) as `deployment × client` axes; Better Auth active baseline; brand-always/org-SaaS-only switcher; platform admin via `users.platformRole`; multi-tenancy = EE/SaaS; managed credits cloud-only; Community funnel charter. Epics #735, #740. (contributor doc: `docs/deployment-modes.md`)

## Rules (symlinked to .claude/rules/)

- [Security](rules/00-security.md) — secret isolation, no outbound HTTP
- [Backend Services](rules/10-backend-services.md) — soft deletes, service boundaries
- [Web Apps](rules/20-web-apps.md) — semantic UI, async cancellation
- [Shared Packages](rules/30-shared-packages.md) — strict types, canonical locations
