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
    // #7552: superadmin all-organizations library listing; gated by the allOrganizations superadmin check in the controller.
    {
      file: 'apps/server/api/src/collections/ingredients/controllers/ingredients.controller.ts',
      line: 252,
    },
    // Superadmin failure resolution; the write itself is scoped to the execution row's own tenant.
    {
      file: 'apps/server/api/src/collections/workflow-executions/controllers/workflow-executions.controller.ts',
      line: 308,
    },
    // Platform-owned system workflow ids are read under the system principal.
    {
      file: 'apps/server/api/src/collections/workflow-executions/services/workflow-execution-query.util.ts',
      line: 60,
    },
    // Historical trend analysis intentionally reads only the shared global corpus; the Prisma where remains pinned to organizationId:null.
    {
      file: 'apps/server/api/src/collections/trends/services/modules/trend-analysis.service.ts',
      line: 112,
    },
    // #5217: billing account plan-limit counts run before the candidate
    // organization is linked (or, in linkOrganization, before the actor's
    // membership proof extends to it) — authorized by the actor's
    // BillingAccountMember role on the account, not by any organizationId.
    {
      file: 'apps/server/api/src/collections/billing-accounts/services/billing-accounts.service.ts',
      line: 501,
    },
    {
      file: 'apps/server/api/src/collections/billing-accounts/services/billing-accounts.service.ts',
      line: 915,
    },
    // #5511: admin-pinned Featured workflows are platform-curated and read by
    // every organization. The read is limited to the pinned ids, non-deleted
    // and non-system, and only a sanitized projection (display fields plus
    // the graph with source-org bindings blanked) leaves the service.
    {
      file: 'apps/server/api/src/collections/workflows/services/featured-workflows.service.ts',
      line: 171,
    },
    // #5763: the superadmin Generations ledger is a read-only cross-tenant view
    // of original/enhanced/compiled prompts plus result images and their cost.
    // It moved out of the ingredients controller into a superadmin-guarded
    // service; Library findAll, delete, and merge stay organization-scoped.
    {
      file: 'apps/server/api/src/collections/ingredients/services/admin-generation-reviews.service.ts',
      line: 35,
    },
    {
      file: 'apps/server/api/src/collections/ingredients/services/admin-generation-reviews.service.ts',
      line: 67,
    },
    // Superadmin prompt-only ledger: read-only list of prompts that have no
    // generation yet, behind the same superadmin guard as the Generations page.
    {
      file: 'apps/server/api/src/collections/prompts/services/admin-prompts.service.ts',
      line: 56,
    },
    // #5981: readPublicSources discovers only non-deleted ingredients that are
    // public (isPublic, scope PUBLIC, or on a visibility PUBLIC post) and keeps
    // only ids confirmed public; selected columns feed server-side grant
    // issuance only and are never returned over HTTP.
    {
      file: 'apps/server/api/src/services/media-urls/authorized-media-url.service.ts',
      line: 265,
    },
    // Platform-admin cross-organization media: the admin Library and Generations
    // list other tenants' assets, so preview grants for ids the organization
    // read did not resolve are issued after a platform-admin check in the
    // response interceptor. Only ids already present in the response are read,
    // and only a signed preview URL leaves the service.
    {
      file: 'apps/server/api/src/services/media-urls/authorized-media-url.service.ts',
      line: 808,
    },
    // Platform-admin batch refresh of those previews: the batch route verifies
    // the platform-admin role and reads only the ids the client already holds.
    {
      file: 'apps/server/api/src/collections/ingredients/controllers/ingredients.controller.ts',
      line: 350,
    },
    // Public brand pictures: the anonymous public profile (/u/<handle>) has no
    // organization to scope by. projectPublicBrandAssets reads only LOGO and
    // BANNER assets whose parent brand is non-deleted with scope PUBLIC, and
    // only the signed picture URL leaves the service (never the storage key).
    {
      file: 'apps/server/api/src/services/media-urls/authorized-media-url.service.ts',
      line: 474,
    },
    {
      file: 'apps/server/api/src/services/media-urls/authorized-media-url.service.ts',
      line: 501,
    },
    // Access discovery: findActiveForUserAccess lists the caller's own active
    // memberships by canonical users.id (userId in the where) to resolve which
    // organizations they belong to (org switcher, identity resolution,
    // onboarding). It never reads another user's rows. #5981 made handlers run
    // inside the tenant context, which turned this into a production 500.
    // #5502 moved this unchanged discovery call four lines for native-app imports.
    // The member role-authority helpers moved it again, unchanged.
    {
      file: 'apps/server/api/src/collections/members/services/members.service.ts',
      line: 181,
    },
    // #6120: hidden system-workflow mirror upsert. System-principal rows are
    // platform-global and owned by the system principal, not the request
    // tenant.
    {
      file: 'apps/server/api/src/collections/workflows/system-workflow-mirror.util.ts',
      line: 35,
    },
    // #6120: assertHiddenSystemWorkflowParent reads the system-principal
    // parent workflow.
    {
      file: 'apps/server/api/src/collections/workflows/system-workflow-runner.service.ts',
      line: 916,
    },
    // #6120: one shared system-principal mirror lookup for normal and failure binding proofs; both callers retain exact principal/soft-delete fences.
    {
      file: 'apps/server/api/src/collections/visual-projects/services/visual-project-workflow.service.ts',
      line: 106,
    },
    // #6120: superadmin-only cross-organization workflow failure feed.
    {
      file: 'apps/server/api/src/collections/workflow-executions/controllers/workflow-executions.controller.ts',
      line: 219,
    },
    // #6120: marketplace lists public workflow templates published by every
    // organization.
    {
      file: 'apps/server/api/src/collections/workflows/controllers/workflow-marketplace.controller.ts',
      line: 135,
    },
    // #6120: runAsSuperAdmin, the single generic-CRUD seam where a verified
    // superadmin reads, edits or removes another organization's row or a
    // platform row (already permitted by
    // canUserReadEntity/canUserModifyEntity).
    {
      file: 'apps/server/api/src/shared/controllers/base-crud/base-crud-scope.util.ts',
      line: 34,
    },
    // Superadmin model detail and routing admin: every read and write targets
    // platform catalog rows (organizationId null) or the global provider
    // routing setting, so there is no tenant to scope to. The controller is
    // behind IpWhitelistGuard and SuperAdminGuard.
    {
      file: 'apps/server/api/src/collections/models/services/model-provider-offers.service.ts',
      line: 22,
    },
    {
      file: 'apps/server/api/src/collections/models/services/model-provider-offers.service.ts',
      line: 125,
    },
    {
      file: 'apps/server/api/src/collections/models/services/model-provider-offers.service.ts',
      line: 255,
    },
    // #6120: superadmin model lifecycle transition on the platform registry.
    // #6593: pricing projection extraction moves the existing three hatches;
    // authorization and cross-tenant behavior are unchanged.
    {
      file: 'apps/server/api/src/collections/models/services/models.service.ts',
      line: 597,
    },
    // #6120: superadmin registry approve.
    {
      file: 'apps/server/api/src/collections/models/services/models.service.ts',
      line: 783,
    },
    // #6120: superadmin registry reject.
    {
      file: 'apps/server/api/src/collections/models/services/models.service.ts',
      line: 881,
    },
    // #6120: skill rows addressed by an already-authorized id or owner;
    // personal and system skills have no organization and grants cross
    // organizations.
    {
      file: 'apps/server/api/src/collections/skills/services/skill-authorized-row.ts',
      line: 11,
    },
    // #6120: platform-global trend refresh when no organization is named.
    {
      file: 'apps/server/api/src/collections/trends/services/modules/trend-analysis.service.ts',
      line: 65,
    },
    // #6120: platform admin trend corpus health.
    {
      file: 'apps/server/api/src/collections/trends/services/modules/trend-corpus-freshness.service.ts',
      line: 224,
    },
    // #6120: superadmin purge of synthetic trend rows.
    {
      file: 'apps/server/api/src/collections/trends/services/modules/trend-query.service.ts',
      line: 118,
    },
    // #6120: superadmin pricing report over the platform model registry.
    {
      file: 'apps/server/api/src/endpoints/admin/model-pricing/model-pricing.service.ts',
      line: 490,
    },
    // #6120: platform (organization-less) outbox and activity events.
    {
      file: 'apps/server/api/src/services/activity-recording/notification-outbox.writer.ts',
      line: 62,
    },
    // #6120: process-wide platform model registry cache; holds platform rows
    // only.
    {
      file: 'apps/server/api/src/services/agent-orchestrator/agent-chat-model-registry.service.ts',
      line: 122,
    },
    // #6120: global bearer-receipt lookup and claim of an organization-less
    // receipt.
    {
      file: 'apps/server/api/src/skills-pro/services/skill-download.service.ts',
      line: 382,
    },
    // #6120: superadmin platform billing-account migration; each write targets
    // that organization's own rows.
    {
      file: 'apps/server/api/src/collections/billing-accounts/services/billing-account-migration.service.ts',
      line: 28,
    },
    // #6120: detachOrganization sibling-organization lookup on the shared
    // billing account, after the OWNER proof.
    {
      file: 'apps/server/api/src/collections/billing-accounts/services/billing-accounts.service.ts',
      line: 761,
    },
    // #6120: superadmin may edit any live brand's handle.
    {
      file: 'apps/server/api/src/collections/brands/controllers/brand-access.helpers.ts',
      line: 97,
    },
    // #6120: brand relocation source lookup may live in another organization;
    // assertCanRelocate authorizes.
    {
      file: 'apps/server/api/src/collections/brands/controllers/brand-access.helpers.ts',
      line: 131,
    },
    // #7016: unchanged relocation preview, after extracting the async status controller; assertCanRelocate authorizes both tenants.
    {
      file: 'apps/server/api/src/collections/brands/controllers/brands.controller.ts',
      line: 320,
    },
    // #7016: unchanged superadmin brand list filtered across organizations; retained after extracting async status reads.
    {
      file: 'apps/server/api/src/collections/brands/controllers/brands.controller.ts',
      line: 397,
    },
    // #7016: unchanged relation hydration for already authorized brands, pinned to each row organization.
    {
      file: 'apps/server/api/src/collections/brands/controllers/brands.controller.ts',
      line: 423,
    },
    // #7016: relocation admission retains the original source-tenant receipt; discovery is bound to initiator/request id and assertCanRelocate authorizes both organizations before creation or response.
    {
      file: 'apps/server/api/src/collections/brands/services/brand-relocation-jobs.service.ts',
      line: 59,
    },
    // #7016: polling an initiator-owned immutable receipt spans its old source and destination; live elevated membership in both is required before returning its result.
    {
      file: 'apps/server/api/src/collections/brands/services/brand-relocation-jobs.service.ts',
      line: 150,
    },
    // #7016: internal platform recovery scans only processing receipt ids and redispatches durable commands; the worker reauthorizes each tenant pair before mutation.
    {
      file: 'apps/server/api/src/collections/brands/services/brand-relocation-jobs.service.ts',
      line: 192,
    },
    // #7016: worker execution replaces the old synchronous relocation boundary; the original accepted actor and live memberships authorize both tenants inside the serializable transaction.
    {
      file: 'apps/server/api/src/collections/brands/services/brand-relocation-jobs.service.ts',
      line: 226,
    },
    // #6120: brand slugs are globally unique across organizations, including
    // soft-deleted rows.
    {
      file: 'apps/server/api/src/collections/brands/services/brand-tenant-scope.util.ts',
      line: 17,
    },
    // #6120: superadmin content-learning account inventory and health.
    {
      file: 'apps/server/api/src/collections/content-learning/controllers/content-learning-admin.controller.ts',
      line: 91,
    },
    // #8168: superadmin prompt slot outcome report reads the organizations
    // named in the query, one organizationId-scoped query per organization.
    {
      file: 'apps/server/api/src/collections/content-learning/controllers/content-learning-admin.controller.ts',
      line: 185,
    },
    // #6120: platform emergency pause locates any organization's learning
    // account.
    {
      file: 'apps/server/api/src/collections/content-learning/services/learning-account.service.ts',
      line: 956,
    },
    // #6120: superadmin dataset assembly across consenting organizations, each
    // fenced by learningOrgFence.
    {
      file: 'apps/server/api/src/collections/content-learning/services/learning-dataset.service.ts',
      line: 229,
    },
    // #6120: invalidation walks cross-tenant derived learning lineage, fenced.
    {
      file: 'apps/server/api/src/collections/content-learning/services/learning-dependency.service.ts',
      line: 181,
    },
    // #6120: read-only pin lookups across contributing organizations.
    {
      file: 'apps/server/api/src/collections/content-learning/services/learning-dependency.service.ts',
      line: 756,
    },
    // #6120: the actor's own userId-scoped memberships in other organizations
    // (grantable organizations).
    {
      file: 'apps/server/api/src/collections/personas/services/persona-grants.service.ts',
      line: 64,
    },
    // #6120: brands of organizations the actor was just proven to administer.
    {
      file: 'apps/server/api/src/collections/personas/services/persona-grants.service.ts',
      line: 88,
    },
    // #6120: prior-paid check across the billing account's linked
    // organizations.
    {
      file: 'apps/server/api/src/collections/referrals/services/referrals.service.ts',
      line: 286,
    },
    // #6120: short codes are globally unique; public redirects resolve without
    // an organization.
    {
      file: 'apps/server/api/src/collections/tracked-links/services/tracked-links.service.ts',
      line: 153,
    },
    // #6120: superadmin platform-wide announcement history.
    {
      file: 'apps/server/api/src/endpoints/admin/announcements/announcements.service.ts',
      line: 166,
    },
    // #6120: runAsPlatformAdmin for the IP-whitelisted, superadmin-guarded
    // warm-up provisioning in the target customer organization.
    {
      file: 'apps/server/api/src/endpoints/admin/warmup-accounts/warmup-accounts.controller.ts',
      line: 294,
    },
    // #6120: superadmin all-organizations analytics when no organization is
    // named.
    {
      file: 'apps/server/api/src/endpoints/analytics/analytics-tenant-scope.ts',
      line: 168,
    },
    // #6120: platform-wide email performance aggregate behind the superadmin
    // guards.
    {
      file: 'apps/server/api/src/services/email-performance/email-performance-report.service.ts',
      line: 35,
    },
    // #6120: superadmin activity list not pinned to the active organization.
    {
      file: 'apps/server/api/src/collections/activities/controllers/activities.controller.ts',
      line: 148,
    },
    // #6120: superadmin operates on a bot in any organization.
    {
      file: 'apps/server/api/src/collections/bots/controllers/bots.controller.ts',
      line: 296,
    },
    // #6120: superadmin list of another organization's credentials.
    {
      file: 'apps/server/api/src/collections/credentials/controllers/credentials.controller.ts',
      line: 154,
    },
    // #6120: superadmin-only GET credential by id across organizations.
    {
      file: 'apps/server/api/src/collections/credentials/controllers/credentials.controller.ts',
      line: 170,
    },
    // #6120: ledger idempotency keys are globally unique, so replay detection
    // is cross-organization.
    {
      file: 'apps/server/api/src/collections/credits/services/credits.utils.service.ts',
      line: 697,
    },
    // The free-trial expiry sweep discovers never-paid organizations past the
    // window across tenants; each one is then expired in its own
    // organization-scoped serializable transaction.
    {
      file: 'apps/server/api/src/collections/credits/services/free-trial.service.ts',
      line: 129,
    },
    // Email-verified grant: resolves the user's first owned organization; the entitlement is user-scoped, not tenant-scoped.
    {
      file: 'apps/server/api/src/collections/credits/listeners/email-verified-credits.listener.ts',
      line: 56,
    },
    // #6120: the signup welcome entitlement is user-scoped across the user's
    // owned organizations.
    {
      file: 'apps/server/api/src/collections/credits/services/onboarding-credit-grants.service.ts',
      line: 106,
    },
    // The free-trial entitlement is user-scoped across the user's owned
    // organizations, exactly like the signup gift above.
    {
      file: 'apps/server/api/src/collections/credits/services/onboarding-credit-grants.service.ts',
      line: 456,
    },
    // Free-credit abuse gate: the same mailbox, IP and grant velocity are
    // compared across all other users' organizations by design.
    {
      file: 'apps/server/api/src/collections/credits/services/signup-grant-eligibility.service.ts',
      line: 126,
    },
    // Free-credit abuse gate: first-session IP lookup for the signing-up user.
    {
      file: 'apps/server/api/src/collections/credits/services/signup-grant-eligibility.service.ts',
      line: 149,
    },
    // Free-credit abuse gate: counts recent free grants to other users on the
    // same IP across tenants.
    {
      file: 'apps/server/api/src/collections/credits/services/signup-grant-eligibility.service.ts',
      line: 168,
    },
    // #6120: superadmin reads another organization's blacklist entry.
    {
      file: 'apps/server/api/src/collections/elements/blacklists/controllers/blacklists.controller.ts',
      line: 144,
    },
    // #6120: superadmin edits another organization's blacklist entry.
    {
      file: 'apps/server/api/src/collections/elements/blacklists/controllers/blacklists.controller.ts',
      line: 167,
    },
    // #6120: superadmin names a foreign organization.
    {
      file: 'apps/server/api/src/collections/engagement-rules/controllers/engagement-rules.controller.ts',
      line: 141,
    },
    // #6120: superadmin reads any organization's folder.
    {
      file: 'apps/server/api/src/collections/folders/controllers/folders.controller.ts',
      line: 88,
    },
    // #6120: superadmin-only CRUD over platform (organization-less) font
    // families.
    {
      file: 'apps/server/api/src/collections/font-families/controllers/font-families.controller.ts',
      line: 80,
    },
    {
      file: 'apps/server/api/src/collections/font-families/controllers/font-families.controller.ts',
      line: 106,
    },
    {
      file: 'apps/server/api/src/collections/font-families/controllers/font-families.controller.ts',
      line: 120,
    },
    // #6120: superadmin may read any organization's article (findOne,
    // createPreviewLink).
    {
      file: 'apps/server/api/src/collections/articles/controllers/articles.controller.ts',
      line: 148,
    },
    // #6120: published public article slugs are unique across all
    // organizations.
    {
      file: 'apps/server/api/src/collections/articles/utils/article-slug.util.ts',
      line: 58,
    },
    // #6120: a granted persona avatar lives in the owning organization; used
    // only when grantedAvatarOwners.has(id).
    {
      file: 'apps/server/api/src/collections/images/services/image-generation-admission.service.ts',
      line: 134,
    },
    // #6120: superadmin-only routes read every organization's subscriptions
    // and wallets.
    {
      file: 'apps/server/api/src/collections/subscriptions/controllers/subscriptions.controller.ts',
      line: 312,
    },
    // #6120: a granted reference lives in the owning organization; used only
    // when grantedOwners.has(id).
    {
      file: 'apps/server/api/src/helpers/utils/reference/reference.util.ts',
      line: 139,
    },
    // #6120: platform maintenance sweep that expires stale recommendations
    // across every organization; each write is scoped to the row's own
    // organization.
    {
      file: 'apps/server/api/src/collections/ad-optimization-recommendations/services/ad-optimization-recommendations.service.ts',
      line: 152,
    },
  ];
