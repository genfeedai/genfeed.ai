---
name: prepush-guard
description: Pre-push quality gate checklist for monorepo changes.
---

# prepush-guard

Use when preparing to push changes.

## When to use

- Before `git push`
- Before opening or updating a PR
- After substantial edits across apps/packages

## Hard rules

- Do not skip local verification and rely on CI to discover basic failures.
- Use scoped checks where possible.
- Do not run unscoped root build for local workflows.

## Execution checklist

1. Format changed files (or full repo when needed):
   - `npx biome check --write .`
2. Lint:
   - `bunx turbo lint`
3. Type-check:
   - `bun type-check`
4. Test changed package(s):
   - `bun run test --filter=@genfeedai/[changed-package]`
5. If backend behavior changed, verify affected service build/run path.

## Quick verification

- Frontend/backend shared baseline:
  - `bunx turbo lint && bun type-check`
- Package-scoped tests:
  - `bun run test --filter=@genfeedai/[changed-package]`
