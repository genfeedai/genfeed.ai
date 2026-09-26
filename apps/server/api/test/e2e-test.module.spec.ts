/**
 * DI-resolution smoke test for `E2ETestModule` (#4375).
 *
 * Deliberately lives at `test/` root, NOT `test/integration/`: this file
 * never touches Postgres (`setup-unit.ts` mocks `@genfeedai/prisma`), so it
 * runs under `vitest.config.ts` on every API PR via `test-api-changed` /
 * `test-api`. `test/integration/**` is excluded from that config and only
 * runs in the nightly/dispatch-only `e2e.yml` suite (see #4375) — moving a
 * fixture-contract spec back under `test/integration/` silently removes it
 * from PR coverage. When #5079 added a PostsService constructor dependency
 * and #5136 changed AgentAutopilotWorkflowService's collaborators, neither
 * broke a PR because the E2E-only integration suite that would have caught
 * it doesn't run there. Keep this file's DI-graph assertions (and any new
 * ones for future collaborator additions) here so a broken constructor graph
 * fails fast on the PR that breaks it.
 */
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import { AgentStrategyAutopilotPerformanceService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-performance.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import { BrandGenerationService } from '@api/collections/brands/services/brand-generation.service';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandKitDraftService } from '@api/collections/brands/services/brand-kit-draft.service';
import { BrandPersistenceService } from '@api/collections/brands/services/brand-persistence.service';
import { BrandRelocationService } from '@api/collections/brands/services/brand-relocation.service';
import { BrandSetupService } from '@api/collections/brands/services/brand-setup.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ProviderAccountPurgeService } from '@api/collections/credentials/services/provider-account-purge.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { LinksService } from '@api/collections/links/services/links.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import { TaskActionsService } from '@api/collections/tasks/services/task-actions.service';
import { TaskPlanningService } from '@api/collections/tasks/services/task-planning.service';
import { TaskRoutingService } from '@api/collections/tasks/services/task-routing.service';
import { UserSetupService } from '@api/collections/users/services/user-setup.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { AgentAutopilotWorkflowService } from '@api/collections/workflows/services/agent-autopilot-workflow.service';
import { SYSTEM_WORKFLOW_RUNNER } from '@api/collections/workflows/workflows.tokens';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import { WorkspaceTaskWorkflowQueueService } from '@api/services/task-orchestration/workspace-task-workflow-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { createTestUser } from '@api-test/e2e/e2e-test.utils';
import {
  BRAND_CONTROLLER_E2E_MOCK_PROVIDERS,
  BRAND_SERVICE_E2E_MOCK_PROVIDERS,
  COLLECTION_E2E_MOCK_PROVIDERS,
  E2ETestModule,
  ORGANIZATION_SETTINGS_E2E_MOCK,
  TASK_E2E_MOCK_PROVIDERS,
} from '@api-test/e2e-test.module';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
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
      OnboardingCreditGrantsService,
      CredentialCryptoService,
      ProviderAccountPurgeService,
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

  it('compiles the real CredentialsService with ProviderAccountPurgeService', async () => {
    const moduleConfig = await E2ETestModule.forRoot({
      providers: [CredentialsService],
    });
    const moduleRef = await Test.createTestingModule({
      imports: [moduleConfig],
    })
      // This spec only proves the constructor graph resolves — it never
      // issues a query — so PrismaService is overridden with an inert stub
      // instead of constructing the real Postgres-backed client, which
      // `test/setup-unit.ts`'s global mocks don't cover the same way the
      // DB-backed `test/integration/**` suite does.
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    try {
      expect(moduleRef.get(CredentialsService)).toBeInstanceOf(
        CredentialsService,
      );
      expect(moduleRef.get(ProviderAccountPurgeService)).toBeInstanceOf(
        ProviderAccountPurgeService,
      );
      const eventEmitter = moduleRef.get(EventEmitter2);
      const markerEvent = 'e2e-fixture.marker';
      eventEmitter.emit(markerEvent);
      expect(eventEmitter.emit).toHaveBeenCalledWith(markerEvent);
    } finally {
      await moduleRef.close();
    }
  });

  it('compiles the real PostsService with its onboarding/publish collaborators (#5079)', async () => {
    // Regression coverage for #4375: #5079 added OnboardingCreditGrantsService
    // to PostsService's constructor without updating this fixture, and the
    // break went undetected because the E2E suite that constructs a real
    // PostsService doesn't run on PRs (test/integration/** is excluded from
    // this config). Any future required PostsService collaborator that this
    // fixture doesn't provide fails this compile, on every API PR.
    const moduleConfig = await E2ETestModule.forRoot({
      providers: [PostsService],
    });
    const moduleRef = await Test.createTestingModule({
      imports: [moduleConfig],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    try {
      expect(moduleRef.get(PostsService)).toBeInstanceOf(PostsService);
    } finally {
      await moduleRef.close();
    }
  });

  it('compiles the real BrandSetupService with its onboarding-credit collaborator (#4375)', async () => {
    // BrandSetupService is a second real consumer of OnboardingCreditGrantsService
    // (alongside PostsService and UserSetupService below) — the same class of
    // collaborator #5079 broke silently. Its own subtree (BrandsService, the
    // scraper/prompt/data/persistence collaborators) is mocked inertly here:
    // this test's job is BrandSetupService's own constructor graph, not
    // exercising those collaborators' behavior.
    const moduleConfig = await E2ETestModule.forRoot({
      providers: [
        BrandSetupService,
        { provide: BrandsService, useValue: {} },
        { provide: MasterPromptGeneratorService, useValue: {} },
        { provide: BrandDataMapper, useValue: {} },
        { provide: BrandPersistenceService, useValue: {} },
        {
          provide: BrandScraperService,
          useValue: { scrapeWebsite: () => Promise.resolve(null) },
        },
      ],
    });
    const moduleRef = await Test.createTestingModule({
      imports: [moduleConfig],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    try {
      expect(moduleRef.get(BrandSetupService)).toBeInstanceOf(
        BrandSetupService,
      );
    } finally {
      await moduleRef.close();
    }
  });

  it('compiles the real UserSetupService with its onboarding-credit collaborator (#4375)', async () => {
    // Third real consumer of OnboardingCreditGrantsService. Its other
    // collaborators are mocked inertly — only UserSetupService's own
    // constructor graph is under test here.
    const moduleConfig = await E2ETestModule.forRoot({
      providers: [
        UserSetupService,
        { provide: OrganizationsService, useValue: {} },
        { provide: BrandsService, useValue: {} },
        { provide: MembersService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        { provide: CreditBalanceService, useValue: {} },
      ],
    });
    const moduleRef = await Test.createTestingModule({
      imports: [moduleConfig],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    try {
      expect(moduleRef.get(UserSetupService)).toBeInstanceOf(UserSetupService);
    } finally {
      await moduleRef.close();
    }
  });

  it('compiles the real AgentAutopilotWorkflowService with its dispatch collaborators (#5136)', async () => {
    // #5136 changed this service's constructor and dispatch collaborators
    // (AgentStrategyAutopilotPerformanceService, thread reuse) without
    // updating the hand-rolled proactive-dispatch fixtures that construct it
    // directly with `new`, entirely outside Nest DI (see #4375). Compiling it
    // here through the real E2ETestModule catches a future required-
    // constructor-param change that those hand-rolled fixtures cannot.
    const moduleConfig = await E2ETestModule.forRoot({
      providers: [
        AgentAutopilotWorkflowService,
        { provide: AgentStrategyAutopilotPerformanceService, useValue: {} },
        { provide: SYSTEM_WORKFLOW_RUNNER, useValue: {} },
        { provide: CreditsUtilsService, useValue: {} },
        { provide: AgentGoalsService, useValue: {} },
      ],
    });
    const moduleRef = await Test.createTestingModule({
      imports: [moduleConfig],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    try {
      expect(moduleRef.get(AgentAutopilotWorkflowService)).toBeInstanceOf(
        AgentAutopilotWorkflowService,
      );
    } finally {
      await moduleRef.close();
    }
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
