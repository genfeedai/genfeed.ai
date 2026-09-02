import { BrandSetupService } from '@api/collections/brands/services/brand-setup.service';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import { createTestUser } from '@api-test/e2e/e2e-test.utils';
import {
  BRAND_CONTROLLER_E2E_MOCK_PROVIDERS,
  BRAND_SERVICE_E2E_MOCK_PROVIDERS,
  COLLECTION_E2E_MOCK_PROVIDERS,
  E2ETestModule,
  ORGANIZATION_SETTINGS_E2E_MOCK,
  TASK_E2E_MOCK_PROVIDERS,
} from '@api-test/e2e-test.module';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { BrandGenerationService } from '@api/collections/brands/services/brand-generation.service';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandKitDraftService } from '@api/collections/brands/services/brand-kit-draft.service';
import { BrandRelocationService } from '@api/collections/brands/services/brand-relocation.service';
import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { LinksService } from '@api/collections/links/services/links.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import { TaskActionsService } from '@api/collections/tasks/services/task-actions.service';
import { TaskPlanningService } from '@api/collections/tasks/services/task-planning.service';
import { TaskRoutingService } from '@api/collections/tasks/services/task-routing.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { WorkspaceTaskWorkflowQueueService } from '@api/services/task-orchestration/workspace-task-workflow-queue.service';
import { describe, expect, it } from 'vitest';

/**
 * Nest accepts both `{ provide: Token, useValue }` objects and bare classes as
 * providers, and a bare class IS its own token. Read both spellings so this
 * contract tracks the fixture's collaborator set rather than one spelling of
 * it — a real (unmocked) collaborator is registered as a bare class.
 */
function resolveProviderToken(provider: unknown): unknown {
  return typeof provider === 'object' &&
    provider !== null &&
    'provide' in provider
    ? provider.provide
    : provider;
}

describe('E2E fixture contracts', () => {
  it('creates users with canonical Prisma fields', () => {
    expect(createTestUser()).not.toHaveProperty('isActive');
  });

  it('provides consumable organization settings defaults', async () => {
    await expect(
      ORGANIZATION_SETTINGS_E2E_MOCK.ensureForOrganization('org-e2e'),
    ).resolves.toMatchObject({
      enabledModelIds: [],
      isGenerateArticlesEnabled: false,
      isGenerateImagesEnabled: true,
      isGenerateMusicEnabled: true,
      isGenerateVideosEnabled: true,
      organizationId: 'org-e2e',
    });
  });

  it('provides every optional BrandsService collaborator to CRUD E2E modules', async () => {
    const expectedBrandTokens = [
      CacheInvalidationService,
      BrandRelocationService,
      BrandGenerationService,
      BrandKitAssetsService,
      BrandKitDraftService,
    ];
    const expectedCollectionTokens = [
      BillingAccountsService,
      CreditReservationService,
      CredentialCryptoService,
      StreaksService,
      DefaultRecurringContentService,
      RolesService,
      OrganizationSettingsService,
      RequestContextCacheService,
      AccessBootstrapCacheService,
      BetterAuthIdentityCacheService,
      UserAccessCacheService,
    ];
    const configuredBrandTokens =
      BRAND_SERVICE_E2E_MOCK_PROVIDERS.map(resolveProviderToken);
    const configuredCollectionTokens =
      COLLECTION_E2E_MOCK_PROVIDERS.map(resolveProviderToken);

    expect(configuredBrandTokens).toEqual(expectedBrandTokens);
    expect(configuredCollectionTokens).toEqual(expectedCollectionTokens);

    const moduleConfig = await E2ETestModule.forRoot({
      providers: [BrandGenerationService],
    });
    const providerTokens = (moduleConfig.providers ?? []).map(
      resolveProviderToken,
    );

    expect(providerTokens).toEqual(
      expect.arrayContaining([
        ...expectedBrandTokens,
        ...expectedCollectionTokens,
      ]),
    );
  });

  it('provides BrandsController and Tasks collaborators for dedicated E2E factories', () => {
    expect(
      BRAND_CONTROLLER_E2E_MOCK_PROVIDERS.map(resolveProviderToken),
    ).toEqual([
      ActivitiesService,
      VideosService,
      ImagesService,
      ArticlesService,
      MusicsService,
      CredentialsService,
      LinksService,
      PostsService,
      AnalyticsAggregationService,
      BrandSetupService,
      BrandScraperService,
    ]);
    expect(TASK_E2E_MOCK_PROVIDERS.map(resolveProviderToken)).toEqual([
      TaskCountersService,
      AgentOrchestratorService,
      TaskRoutingService,
      TaskActionsService,
      TaskPlanningService,
      WorkspaceTaskWorkflowQueueService,
    ]);
  });
});
