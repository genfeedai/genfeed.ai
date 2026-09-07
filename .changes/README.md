# `.changes/` — package API surface notes

A changenote here records a **public API surface change to a `packages/*` workspace**
that does not come with a package version bump.

This is not agent memory (`.agents/`) and not the product changelog
(`CHANGELOG.md`, generated from commits by `cliff.toml`). It exists for one
consumer: `scripts/check-package-api-surface.ts`.

## When you need one

`bun run check:package-api-surface --base-ref <merge-base>` diffs the exported
type surface of every `packages/*` workspace against the base ref. If a package's
public exports changed and its `package.json` version did not, the check fails and
asks for either a version bump or a note here.

## Format

One markdown file per change. The first line lists the affected packages:

```markdown
packages: @genfeedai/contracts/constants @genfeedai/contracts

Add explicit `posts:draft`, `posts:schedule`, `posts:approve`, and
`posts:publish` API-key capabilities.

Existing keys retain their stored scopes and must be reissued or updated before
using newly gated schedule, approval, or direct-publish operations.
```

Bare package names (`packages: ui`) also resolve. Everything after the first line
is prose for whoever upgrades: what changed, and what a consumer must do about it.

Name the file after the change, not the package — `mcp-publishing-scopes.md`,
not `contracts.md`.

## Lifecycle

Notes are kept, not swept. They are the written record of why a package's surface
moved between releases.
