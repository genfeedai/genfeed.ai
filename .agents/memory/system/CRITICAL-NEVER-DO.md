# CRITICAL: NEVER DO THIS

Violations that break builds, lose data, or violate architecture. For positive coding standards, see the repo's CLAUDE.md.

## Project-Specific Highlights

Read BOTH this file and the project's own critical doc before coding.

- Frontend (`apps/app`): NEVER run unscoped full builds at repo root. Use scoped Bun/Turbo app builds (for example `bunx turbo build --filter=@genfeedai/app`). See: `.agents/memory/system/CRITICAL-NEVER-DO.md`
- Backend (`apps/server`): Scoped tests allowed (single file/module). NEVER unscoped `bun test`. Enforce `isDeleted: false`. See: `.agents/memory/system/CRITICAL-NEVER-DO.md`

---

## File Management

### NEVER Work Outside Workspace Directory

All operations within the workspace root only. NEVER use `/tmp`, `/private/tmp`, or any external directory.

### NEVER DELETE Protected Root Files

At repo root: `AGENTS.md` and `CLAUDE.md`, `CONTRIBUTING.md`, `DESIGN.md`, `README.md`, and `RELEASING.md`. These are intentional root documentation surfaces -- NOT duplicates of `.agents/` files.

### NEVER Create Root-Level .md Files

Only the current intentional root docs are allowed at root: `AGENTS.md` and `CLAUDE.md`, `CONTRIBUTING.md`, `DESIGN.md`, `README.md`, and `RELEASING.md`. Everything else goes in `.agents/`.

### Session Files: ONE FILE PER DAY

Pattern: `.agents/sessions/YYYY-MM-DD.md`. Multiple sessions same day -> add to SAME file. Only allowed patterns: `README.md`, `TEMPLATE.md`, `YYYY-MM-DD.md`.

---

## Coding Violations

Most of these are stated once in the repo's `CLAUDE.md` and are now guard-enforced in CI; kept here
as a one-line index, not restated in full.

- **Organization scoping + `isDeleted: false` on every tenant-scoped query** — enforced by
  `bun run check:tenant-scope` (`scripts/architecture/check-tenant-scope.ts`).
- **No inline interfaces** (props -> `packages/props/`, state/helpers -> `packages/contracts/src/interfaces/`)
  — enforced for `apps/app/app/**` by `bun run check:inline-types`.
- **Serializers live only in `packages/serializers/`, never in API modules; never return a raw DB record**
  — see `context/system-patterns.md` (Serializer triplet); cross-checked by `bun run check:serializer-drift`.
- **Soft delete is `isDeleted: boolean`; there is no `deletedAt`.**
- **AbortController in every async `useEffect`** — not currently guard-checked; see `CLAUDE.md`.
- **No dynamic `import('...')` inline in type definitions; no backward-compatibility wrappers/aliases/re-exports**
  — not guard-checked; green-field policy, fix at the source (`CLAUDE.md` Philosophy).
- **Compound indexes live in Prisma schema `@@index` or explicit migrations**, close to the owning model.
