packages: @genfeedai/libs

Extend the runtime tenant-isolation guard (`packages/libs/prisma/tenant-guard.ts`,
`tenant-guard.extension.ts`) and its tenant context (`tenant-context.ts`,
`discover-tenant-models.ts`) with a first-class `BillingAccountScope` proof path
(#5217), plus post-review hardening (#5231):

- `assertTenantScopedQuery` accepts optional `billingAccountModelNames` and, when a
  billing-account-capable model's query carries no `organizationId` anywhere, may
  accept a registered `billingAccountId` from its `where` clause instead —
  never from `data`/`create`/`update` payloads, and never as a substitute for an
  `organizationId` that is actually present.
- `getActiveBillingAccountScopes()` now returns a `has()`-only
  `BillingAccountScopeMembership` view instead of the live `Set<string>`, so no
  caller outside `registerBillingAccountScope` can mutate or replace the
  underlying scope store.
- `registerBillingAccountScope` remains reachable only from
  `apps/server/api/src/tenancy/billing-account-scope.ts`'s resolution logic,
  enforced by `bun run check:billing-account-scope-registration`, which now scans
  import declarations (named or namespace) rather than call sites.

Consumers that already call `assertTenantScopedQuery`/`createTenantGuardExtension`
without `billingAccountModelNames` are unaffected — this is additive. A consumer
reading `getActiveBillingAccountScopes()`'s return value as a `Set` (`.size`,
`.has` used to work either way) must switch to `.has(id)` only.
