# Memory Index

- [Project Overview](project_overview.md) — Genfeed.ai monorepo structure and key context
- [One API Epic](project_one_api_epic.md) — Epic #95: consolidate self-hosted + cloud into one NestJS API, 20 issues, 8 phases
- [Fallow Health](project_fallow.md) — Fallow codebase health analysis (#83), weekly CI, score 72/100
- [BullMQ Refactor](project_bullmq.md) — 32 @Processor decorators in API need moving to Workers (#84)
- [Migration Status](project_migration.md) — cloud + core → genfeed.ai migration complete, all pages/tests present
- [Never lose code](feedback_never_lose_code.md) — Always branch+push WIP before destructive git ops
- [Never commit/push to master](feedback_never_commit_to_master.md) — Feature branches: commit freely. Master: always ask. Prior .env.production leak incident.
- [proxy.ts is middleware](feedback_proxy_middleware.md) — Next.js 16 renamed middleware.ts → proxy.ts, never question this
- [Use @ui/primitives](feedback_ui_primitives.md) — Never raw `<button>`, `<input>`, etc. — blocked by lint-no-raw-html.sh
- [Codex adversarial review](feedback_codex_adversarial_review.md) — Use Agent(codex:codex-rescue) not Skill tool; strip --write for read-only reviews
- [GitHub issue worktree workflow](feedback_gh_issue_worktree_workflow.md) — Assigned GitHub issues use worktrees from develop, PR to develop, CI, then merge
