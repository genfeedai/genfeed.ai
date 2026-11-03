/**
 * Ratchet baseline for check-authority-field-optional.ts (#7137).
 *
 * Every server DTO property named `scopes`, `expiresAt`, `allowedIps`, `role`
 * or `organizationId` that still carries `@IsOptional()`. Entries may ONLY be
 * removed (by switching the field to `@IsOmittable()` or deleting it), never
 * added; check-ratchet-growth.ts fails a PR that appends one.
 */

export type AuthorityFieldOptionalBaselineEntry = {
  file: string;
  property: string;
};

export const AUTHORITY_FIELD_OPTIONAL_BASELINE: readonly AuthorityFieldOptionalBaselineEntry[] =
  [
    {
      file: 'apps/server/api/src/collections/bots/dto/bots-query.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/collections/brands/dto/update-brand.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/collections/campaign-targets/dto/create-campaign-target.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/collections/content-learning/dto/learning-prompt-slot-outcome.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/collections/contexts/dto/create-knowledge-version.dto.ts',
      property: 'expiresAt',
    },
    {
      file: 'apps/server/api/src/collections/contexts/dto/knowledge-lifecycle.dto.ts',
      property: 'expiresAt',
    },
    {
      file: 'apps/server/api/src/collections/credentials/dto/manual-account-health-override.dto.ts',
      property: 'expiresAt',
    },
    {
      file: 'apps/server/api/src/collections/customer-instances/dto/create-customer-instance.dto.ts',
      property: 'role',
    },
    {
      file: 'apps/server/api/src/collections/elements/sounds/dto/create-sound.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/collections/ingredients/dto/create-ingredient.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/collections/models/dto/create-model.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/collections/models/dto/models-query.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/collections/monitored-accounts/dto/monitored-accounts-query.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/collections/outreach-campaigns/dto/outreach-campaigns-query.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/collections/presets/dto/create-preset.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/collections/prompts/dto/create-prompt.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/collections/prompts/dto/enhance-prompt.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/collections/reply-bot-configs/dto/reply-bot-configs-query.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/collections/social-inbox/dto/social-inbox-query.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/collections/trends/dto/trend-ideas.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/collections/watchlists/dto/watchlists-query.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/endpoints/admin/seeds/dto/seed-articles.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/endpoints/admin/seeds/dto/seed-workflows.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/endpoints/admin/unit-economics/dto/unit-economics-query.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/endpoints/analytics/dto/leaderboard-query.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/endpoints/analytics/dto/x-growth-report-query.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/helpers/dto/base-query.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/helpers/dto/brand-scope-query.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/oauth/dto/authorize-decision.dto.ts',
      property: 'organizationId',
    },
    {
      file: 'apps/server/api/src/shared/dto/base/base.dto.ts',
      property: 'organizationId',
    },
  ];
