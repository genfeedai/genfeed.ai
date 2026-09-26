/**
 * Ratchet baseline for check-billing-account-scope-registration.ts (#5217).
 *
 * Every production `registerBillingAccountScope(` call site. A raw
 * `billingAccountId` string has no org-scoped proof behind it, so this
 * registration function may only ever be called from
 * `resolveBillingAccountAccess`'s own resolution logic — never from
 * anywhere else, no matter how the caller obtained the id. Entries may ONLY
 * be removed or relocated with a reviewed reason — never added silently.
 *
 * When this list has more than the one call site inside
 * `resolveBillingAccountAccessInternal`, something is calling the
 * registration function directly instead of going through resolution — that
 * is exactly what this ratchet exists to catch.
 */

export type BillingAccountScopeRegistrationBaselineEntry = {
  file: string;
  line: number;
};

export const BILLING_ACCOUNT_SCOPE_REGISTRATION_BASELINE: readonly BillingAccountScopeRegistrationBaselineEntry[] =
  [
    {
      file: 'apps/server/api/src/tenancy/billing-account-scope.ts',
      line: 171,
    },
    {
      file: 'apps/server/api/src/tenancy/billing-account-scope.ts',
      line: 190,
    },
  ];
