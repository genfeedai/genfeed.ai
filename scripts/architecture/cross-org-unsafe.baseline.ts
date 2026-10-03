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
      line: 494,
    },
    {
      file: 'apps/server/api/src/collections/billing-accounts/services/billing-accounts.service.ts',
      line: 896,
    },
    // #5511: admin-pinned Featured workflows are platform-curated and read by
    // every organization. The read is limited to the pinned ids, non-deleted
    // and non-system, and only a sanitized projection (display fields plus
    // the graph with source-org bindings blanked) leaves the service.
    {
      file: 'apps/server/api/src/collections/workflows/services/featured-workflows.service.ts',
      line: 214,
    },
    // #5763: superadmin generation review is a read-only cross-tenant ledger
    // of original/enhanced/compiled prompts plus result images. Library
    // findAll, delete, and merge stay organization-scoped.
    {
      file: 'apps/server/api/src/collections/ingredients/controllers/ingredients.controller.ts',
      line: 273,
    },
    // #5981: readPublicSources discovers only non-deleted ingredients that are
    // public (isPublic, scope PUBLIC, or on a visibility PUBLIC post) and keeps
    // only ids confirmed public; selected columns feed server-side grant
    // issuance only and are never returned over HTTP.
    {
      file: 'apps/server/api/src/services/media-urls/authorized-media-url.service.ts',
      line: 211,
    },
  ];
