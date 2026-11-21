# CRITICAL: NEVER DO THIS

Violations that break builds, lose data, or violate architecture. Coding rules live in the repo's `AGENTS.md`.

## Commands

- NEVER run unscoped full builds at repo root. Use scoped Bun/Turbo builds (for example `bunx turbo build --filter=@genfeedai/web`).
- Backend (`apps/server`): scoped tests are allowed (single file or module). NEVER run unscoped `bun test`.

## File Management

### NEVER Work Outside Workspace Directory

All operations within the workspace root only. NEVER use `/tmp`, `/private/tmp`, or any external directory.

### NEVER DELETE Protected Root Files

These root files are intentional documentation surfaces, NOT duplicates of `.agents/` files: `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `CONTRIBUTING.md`, `DESIGN.md`, `README.md`, `RELEASING.md`, and the community and legal files `CCLA.md`, `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `ICLA.md`, `SECURITY.md`, `SUPPORT.md`, `TRADEMARK.md`.

### NEVER Create Root-Level .md Files

Only the files listed above are allowed at root. Everything else goes in `.agents/`.

## Types

- No dynamic `import('...')` inline in type definitions.
