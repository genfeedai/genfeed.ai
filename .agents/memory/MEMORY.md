# Memory Index

## Project State
- [Project Overview](project_overview.md) — Genfeed.ai monorepo structure and key context
- [One API Epic](project_one_api_epic.md) — Epic #95: consolidate self-hosted + cloud into one NestJS API, 20 issues, 8 phases
- [Fallow Health](project_fallow.md) — Fallow codebase health analysis (#83), weekly CI, score 72/100
- [BullMQ Refactor](project_bullmq.md) — 32 @Processor decorators in API need moving to Workers (#84)
- [Migration Status](project_migration.md) — cloud + core → genfeed.ai migration complete, all pages/tests present

## Feedback (user corrections — permanent)
- [Never lose code](feedback_never_lose_code.md) — Always branch+push WIP before destructive git ops
- [Never commit/push to master](feedback_never_commit_to_master.md) — Feature branches: commit freely. Master: always ask.
- [proxy.ts is middleware](feedback_proxy_middleware.md) — Next.js 16 renamed middleware.ts → proxy.ts
- [Use @ui/primitives](feedback_ui_primitives.md) — Never raw HTML elements — blocked by lint-no-raw-html.sh
- [Codex adversarial review](feedback_codex_adversarial_review.md) — MANDATORY before ExitPlanMode
- [GitHub issue worktree workflow](feedback_gh_issue_worktree_workflow.md) — Assigned issues use worktrees from develop
- [No external symlinks](feedback_no_external_symlinks.md) — Open source repo. Internal symlinks only.

## References
- [MongoDB Atlas URI](reference_mongodb_atlas.md) — Atlas connection string for `cloud` DB

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

## Architecture Decisions
- [Dynamic Scheduling](architecture/ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL.md) — scheduling via workflow engine
- [PLG Boundary](architecture/ADR-PLG-BOUNDARY-OSS-CLOUD.md) — OSS vs cloud feature split
- [Workflow-Backed Agents](architecture/ADR-WORKFLOW-BACKED-RECURRING-AGENT-AUTOMATION.md) — recurring agent automation

## Rules (symlinked to .claude/rules/)
- [Security](rules/00-security.md) — secret isolation, no outbound HTTP
- [Backend Services](rules/10-backend-services.md) — soft deletes, service boundaries
- [Web Apps](rules/20-web-apps.md) — semantic UI, async cancellation
- [Shared Packages](rules/30-shared-packages.md) — strict types, canonical locations
