import { AuthBootstrapController } from '@api/auth/controllers/auth-bootstrap.controller';
import { BrandMemoryController } from '@api/collections/brand-memory/controllers/brand-memory.controller';
import { BrandedGenerationReceiptsController } from '@api/collections/branded-generation-receipts/controllers/branded-generation-receipts.controller';
import { BrandInterviewController } from '@api/collections/brands/brand-interview/controllers/brand-interview.controller';
import { BrandOsRevisionsController } from '@api/collections/brands/controllers/brand-os-revisions.controller';
import { BrandOsScanController } from '@api/collections/brands/controllers/brand-os-scan.controller';
import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { BrandsAgentConfigController } from '@api/collections/brands/controllers/brands-agent-config.controller';
import { BrandsRelationshipsController } from '@api/collections/brands/controllers/relationships/brands-relationships.controller';
import { ContentRunsController } from '@api/collections/content-runs/controllers/content-runs.controller';
import { StoryboardRunsController } from '@api/collections/content-runs/controllers/storyboard-runs.controller';
import { CredentialsController } from '@api/collections/credentials/controllers/credentials.controller';
import { CredentialsPublishingController } from '@api/collections/credentials/controllers/credentials-publishing.controller';
import { CreditsController } from '@api/collections/credits/controllers/credits.controller';
import { ImportedSourceMediaController } from '@api/collections/imported-sources/controllers/imported-source-media.controller';
import { ImportedSourcesController } from '@api/collections/imported-sources/controllers/imported-sources.controller';
import { MembersController } from '@api/collections/members/controllers/members.controller';
import { TeamMentionsController } from '@api/collections/members/controllers/team-mentions.controller';
import { ProfilesController } from '@api/collections/profiles/controllers/profiles.controller';
import { StreaksController } from '@api/collections/streaks/controllers/streaks.controller';
import { UsersController } from '@api/collections/users/controllers/users.controller';
import { BrandOsExportController } from '@api/services/brand-os-export/brand-os-export.controller';
import { ContentEngineController } from '@api/services/content-engine/content-engine.controller';
import { ContentOptimizationController } from '@api/services/content-optimization/content-optimization.controller';
import { ExpertPathController } from '@api/services/expert-path/expert-path.controller';

export const TENANT_READ_ACCOUNT_ROUTES = [
  {
    controller: AuthBootstrapController,
    handler: 'bootstrap',
    route: '/v1/auth/bootstrap',
    policy: 'owner',
  },
  {
    controller: BrandInterviewController,
    handler: 'getById',
    route: '/v1/brands/interview/{interviewId}',
    policy: 'selected',
  },
  {
    controller: BrandsController,
    handler: 'findOneBySlug',
    route: '/v1/brands/slug',
    policy: 'selected',
  },
  {
    controller: BrandsController,
    handler: 'findOne',
    route: '/v1/brands/{brandId}',
    policy: 'selected',
  },
  {
    controller: BrandsRelationshipsController,
    handler: 'findBrandAnalytics',
    route: '/v1/brands/{brandId}/analytics',
    policy: 'selected',
  },
  {
    controller: BrandsRelationshipsController,
    handler: 'findBrandAnalyticsTimeSeries',
    route: '/v1/brands/{brandId}/analytics/timeseries',
    policy: 'selected',
  },
  {
    controller: BrandInterviewController,
    handler: 'getCompleteness',
    route: '/v1/brands/{brandId}/completeness',
    policy: 'selected',
  },
  {
    controller: ContentRunsController,
    handler: 'listBrandRuns',
    route: '/v1/brands/{brandId}/content-runs',
    policy: 'selected',
  },
  {
    controller: ContentEngineController,
    handler: 'listPlans',
    route: '/v1/brands/{brandId}/content/plans',
    policy: 'selected',
  },
  {
    controller: ContentEngineController,
    handler: 'getPlan',
    route: '/v1/brands/{brandId}/content/plans/{planId}',
    policy: 'selected',
  },
  {
    controller: ExpertPathController,
    handler: 'getStatus',
    route: '/v1/brands/{brandId}/expert-path',
    policy: 'selected',
  },
  {
    controller: ExpertPathController,
    handler: 'getFirstSystem',
    route: '/v1/brands/{brandId}/expert-path/first-system',
    policy: 'selected',
  },
  {
    controller: BrandedGenerationReceiptsController,
    handler: 'list',
    route: '/v1/brands/{brandId}/generation-receipts',
    policy: 'owner',
  },
  {
    controller: BrandedGenerationReceiptsController,
    handler: 'identityPreview',
    route: '/v1/brands/{brandId}/generation-receipts/identity-preview',
    policy: 'owner',
  },
  {
    controller: BrandedGenerationReceiptsController,
    handler: 'history',
    route: '/v1/brands/{brandId}/generation-receipts/{receiptId}/history',
    policy: 'owner',
  },
  {
    controller: ImportedSourcesController,
    handler: 'get',
    route: '/v1/brands/{brandId}/imported-sources/{id}',
    policy: 'selected',
  },
  {
    controller: ImportedSourceMediaController,
    handler: 'observe',
    route: '/v1/brands/{brandId}/imported-sources/{id}/media',
    policy: 'mutating',
  },
  {
    controller: BrandInterviewController,
    handler: 'getActiveForBrand',
    route: '/v1/brands/{brandId}/interview/active',
    policy: 'selected',
  },
  {
    controller: BrandMemoryController,
    handler: 'getMemory',
    route: '/v1/brands/{brandId}/memory',
    policy: 'selected',
  },
  {
    controller: BrandMemoryController,
    handler: 'getInsights',
    route: '/v1/brands/{brandId}/memory/insights',
    policy: 'selected',
  },
  {
    controller: ContentOptimizationController,
    handler: 'getRecommendations',
    route: '/v1/brands/{brandId}/optimization/recommendations',
    policy: 'mutating',
  },
  {
    controller: ContentOptimizationController,
    handler: 'getSuggestions',
    route: '/v1/brands/{brandId}/optimization/suggestions',
    policy: 'mutating',
  },
  {
    controller: BrandsRelationshipsController,
    handler: 'findBrandPlatformAnalytics',
    route: '/v1/brands/{brandId}/platforms/{platform}/analytics',
    policy: 'selected',
  },
  {
    controller: StoryboardRunsController,
    handler: 'list',
    route: '/v1/brands/{brandId}/storyboard-runs',
    policy: 'selected',
  },
  {
    controller: StoryboardRunsController,
    handler: 'get',
    route: '/v1/brands/{brandId}/storyboard-runs/{runId}',
    policy: 'selected',
  },
  {
    controller: StoryboardRunsController,
    handler: 'getCapabilities',
    route: '/v1/brands/{brandId}/storyboard-runs/{runId}/capabilities',
    policy: 'selected',
  },
  {
    controller: StoryboardRunsController,
    handler: 'characterReplacements',
    route:
      '/v1/brands/{brandId}/storyboard-runs/{runId}/shots/{shotId}/character-replacements',
    policy: 'selected',
  },
  {
    controller: StoryboardRunsController,
    handler: 'characterReplacementStatus',
    route:
      '/v1/brands/{brandId}/storyboard-runs/{runId}/shots/{shotId}/character-replacements/{operationId}',
    policy: 'mutating',
  },
  {
    controller: BrandsAgentConfigController,
    handler: 'readClaimedBrandOsPreview',
    route: '/v1/brands/{id}/brand-kit/brand-os',
    policy: 'selected',
  },
  {
    controller: BrandOsExportController,
    handler: 'state',
    route: '/v1/brands/{id}/brand-os/export',
    policy: 'owner',
  },
  {
    controller: BrandOsRevisionsController,
    handler: 'list',
    route: '/v1/brands/{id}/brand-os/revisions',
    policy: 'mutating',
  },
  {
    controller: BrandOsRevisionsController,
    handler: 'get',
    route: '/v1/brands/{id}/brand-os/revisions/{revisionId}',
    policy: 'selected',
  },
  {
    controller: BrandOsScanController,
    handler: 'get',
    route: '/v1/brands/{id}/brand-os/scan',
    policy: 'mutating',
  },
  {
    controller: ContentRunsController,
    handler: 'getRun',
    route: '/v1/content-runs/{id}',
    policy: 'selected',
  },
  {
    controller: ContentRunsController,
    handler: 'getBrandRemixRun',
    route: '/v1/content-runs/{id}/remix',
    policy: 'mutating',
  },
  {
    controller: CredentialsPublishingController,
    handler: 'listBrandAccountHealth',
    route: '/v1/credentials/brand/{brandId}/account-health',
    policy: 'mutating',
  },
  {
    controller: CredentialsPublishingController,
    handler: 'listBrandPublishingReadiness',
    route: '/v1/credentials/brand/{brandId}/publishing-readiness',
    policy: 'selected',
  },
  {
    controller: CredentialsPublishingController,
    handler: 'getMentions',
    route: '/v1/credentials/mentions',
    policy: 'selected',
  },
  {
    controller: CredentialsController,
    handler: 'findAllInstagramPages',
    route: '/v1/credentials/{credentialId}/instagram/pages',
    policy: 'mutating',
  },
  {
    controller: CredentialsPublishingController,
    handler: 'findNextPostingSlot',
    route: '/v1/credentials/{credentialId}/next-slot',
    policy: 'selected',
  },
  {
    controller: CredentialsPublishingController,
    handler: 'listPostingTimes',
    route: '/v1/credentials/{credentialId}/posting-times',
    policy: 'selected',
  },
  {
    controller: CredentialsPublishingController,
    handler: 'getPublishingContext',
    route: '/v1/credentials/{credentialId}/publishing-context',
    policy: 'mutating',
  },
  {
    controller: CredentialsPublishingController,
    handler: 'getQuotaStatus',
    route: '/v1/credentials/{credentialId}/quota',
    policy: 'selected',
  },
  {
    controller: CreditsController,
    handler: 'getLastPurchaseBaseline',
    route: '/v1/credits/last-purchase-baseline',
    policy: 'mutating',
  },
  {
    controller: CreditsController,
    handler: 'listTransactions',
    route: '/v1/credits/transactions',
    policy: 'selected',
  },
  {
    controller: CreditsController,
    handler: 'getUsageMetrics',
    route: '/v1/credits/usage',
    policy: 'mutating',
  },
  {
    controller: MembersController,
    handler: 'listInvitations',
    route: '/v1/members/invitations',
    policy: 'selected',
  },
  {
    controller: MembersController,
    handler: 'findOne',
    route: '/v1/members/{memberId}',
    policy: 'selected',
  },
  {
    controller: StreaksController,
    handler: 'getMyStreak',
    route: '/v1/organizations/{organizationId}/streaks/me',
    policy: 'owner',
  },
  {
    controller: StreaksController,
    handler: 'getMyCalendar',
    route: '/v1/organizations/{organizationId}/streaks/me/calendar',
    policy: 'owner',
  },
  {
    controller: ProfilesController,
    handler: 'findAll',
    route: '/v1/profiles',
    policy: 'selected',
  },
  {
    controller: ProfilesController,
    handler: 'findOne',
    route: '/v1/profiles/{profileId}',
    policy: 'selected',
  },
  {
    controller: TeamMentionsController,
    handler: 'getMentions',
    route: '/v1/team/mentions',
    policy: 'selected',
  },
  {
    controller: UsersController,
    handler: 'findMe',
    route: '/v1/users/me',
    policy: 'owner',
  },
] as const;
