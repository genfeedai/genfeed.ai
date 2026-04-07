# Genfeed.ai — Codex Entry

## Last Verified

- **Date:** 2026-04-07

Codex-specific fast reference. See `AGENTS.md` for full project context.

## Reality Snapshot

- Frontend apps: 4 (`app`, `admin`, `website`, `desktop`) + mobile + extensions
- Backend services: 12 on `apps/server/` (api, clips, discord, files, images, mcp, notifications, slack, telegram, videos, voices, workers)
- Shared packages: 45+ directories under `packages/`
- Enterprise features: `ee/packages/` (commercial license)

## Rules

- Use scoped commands only (`turbo --filter`, `bun build:app ...`)
- Never run unscoped root `build` in local workflows
- Keep docs and code consistent when changing architecture claims
- GitHub Issues/Projects are the canonical backlog
- `.agents/TASKS/INBOX.md` is allowed for immediate triage only

## Automation Decision Matrix

- Use a `skill` when the work is a repeatable, human-in-the-loop workflow with stable steps.
- Use a `plugin` when the workflow needs external system integrations or API surfaces.
- Use an `agent` when the loop should run autonomously across multiple steps with retries/checkpoints.
- Use `CODEX.md` only for always-on, non-negotiable project guardrails and done criteria.

## Always-On Guardrails

- Keep serializers in `packages/serializers`; do not inline response shaping in controllers/services.
- Preserve strict TypeScript quality (no `any` shortcuts for new code).
- Use path aliases, not deep relative imports.
- Treat MongoDB `users._id` as canonical user reference; do not use Clerk `user.id` as DB foreign key.
- Enterprise code (`ee/`): enforce multi-tenancy query guards.
- Self-hosted (non-`ee/`): organization filter is optional for single-tenant deployments.
- Soft deletes: `isDeleted: boolean` (NOT `deletedAt`).

## Essential Commands

```bash
bun install
bunx turbo lint
bun type-check
bun run test --filter=@genfeedai/[changed-package]
```

## Canonical Docs

- `AGENTS.md` — Universal project reference
- `CLAUDE.md` — Claude Code reference
- `.agents/SYSTEM/critical/CRITICAL-NEVER-DO.md` — Production-breaking violations
- `.agents/SYSTEM/AGENT-RUNTIME.md` — Task loop and recovery protocol
- `.agents/README.md` — Full documentation navigation
