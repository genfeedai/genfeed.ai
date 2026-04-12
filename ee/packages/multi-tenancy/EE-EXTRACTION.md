# @genfeedai/ee-multi-tenancy — Phase C Extraction Plan

Tracking issue: [#87](https://github.com/genfeedai/genfeed.ai/issues/87)

Plan file: `.claude-genfeedai/plans/delegated-churning-sifakis.md` §5.1b

## Status

**Layer 1 — scaffold only.** README-only placeholder.

**Layer 2 — TODO:**

Multi-tenancy in Genfeed.ai is an enterprise feature. When `isEEEnabled() === true`, every MongoDB query includes `{ organization: orgId, isDeleted: false }` and the global `CombinedAuthGuard` enforces org-scoped access. Single-tenant self-hosted deployments only filter `{ isDeleted: false }`.

The current implementation is intertwined with OSS core because `CombinedAuthGuard`, request-context middleware, and org-scoped query helpers all have to load for every request regardless of edition. The split is:

## Move targets (pending grep pass)

The first sub-task of Layer 2 is to grep the repo for "multi-tenancy-specific" code that is distinct from OSS "use the default organization" code. Candidates:

| Source | Target | Notes |
|---|---|---|
| `apps/server/api/src/helpers/guards/combined-auth/` | Possibly part of `src/guards/` | Needs audit — the guard is also OSS-critical (auth entry point) |
| Any `OrgGuard` or org-scoped query helpers | `src/guards/org/` | Grep for `{ organization: orgId }` filter patterns |
| `@genfeedai/config` multi-tenancy flags | Stay in OSS — the gate is always needed | Keep |
| Test utilities for org isolation | `src/testing/` | If any exist |

## OSS behavior when EE is disabled

OSS boots with a single default organization (seeded on first boot by `SelfHostedSeedModule`). Request-context middleware (`request-context.middleware.ts:54`) already has an `IS_SELF_HOSTED` branch that hydrates the default org. Layer 2 leaves that OSS path intact and only gates the enterprise enforcement side.

## Related

- Epic #87 (parent)
- Depends on the billing extraction landing first (guards are tangled)
