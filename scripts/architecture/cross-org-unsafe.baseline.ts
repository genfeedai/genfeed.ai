/**
 * Ratchet baseline for check-cross-org-unsafe.ts (#2364).
 *
 * Every production `crossOrgUnsafe(` call site. Entries may ONLY be removed
 * or relocated with a reviewed reason — never added silently. The identifier
 * is the named CLOUD tenant-guard escape hatch; a boolean flag is forbidden.
 *
 * When this list is empty, the only legal production mention is the function
 * declaration itself.
 */

export type CrossOrgUnsafeBaselineEntry = {
  file: string;
  line: number;
};

export const CROSS_ORG_UNSAFE_BASELINE: readonly CrossOrgUnsafeBaselineEntry[] =
  [
    // Historical trend analysis intentionally reads only the shared global corpus; the Prisma where remains pinned to organizationId:null.
    {
      file: 'apps/server/api/src/collections/trends/services/modules/trend-analysis.service.ts',
      line: 103,
    },
    // #5217: billing account plan-limit counts run before the candidate
    // organization is linked (or, in linkOrganization, before the actor's
    // membership proof extends to it) — authorized by the actor's
    // BillingAccountMember role on the account, not by any organizationId.
    {
      file: 'apps/server/api/src/collections/billing-accounts/services/billing-accounts.service.ts',
      line: 319,
    },
    {
      file: 'apps/server/api/src/collections/billing-accounts/services/billing-accounts.service.ts',
      line: 731,
    },
  ];
