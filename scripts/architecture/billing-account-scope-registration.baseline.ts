/**
 * Ratchet baseline for check-billing-account-scope-registration.ts (#5217;
 * import-based redesign, #5231 hardening).
 *
 * Every production import declaration that pulls `registerBillingAccountScope`
 * in from `tenant-context` (by exported name, alias or not), or a namespace
 * import of the whole `tenant-context` module. A raw `billingAccountId`
 * string has no org-scoped proof behind it, so this registration function
 * may only ever be reached from `resolveBillingAccountAccess`'s own
 * resolution logic — never from anywhere else, no matter how the caller
 * obtained the id or the binding. Entries may ONLY be removed or relocated
 * with a reviewed reason — never added silently.
 *
 * When this list has more than the one import inside
 * `apps/server/api/src/tenancy/billing-account-scope.ts` (where
 * `resolveBillingAccountAccessInternal` lives), something is importing the
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
      line: 3,
    },
  ];
