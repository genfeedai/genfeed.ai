vi.mock(
  '@api/collections/outreach-campaigns/services/outreach-campaigns.service',
  () => ({
    OutreachCampaignsService: class OutreachCampaignsService {},
  }),
);

import 'reflect-metadata';
import type { SystemWorkflowActionExecutor } from '@api/collections/workflows/system-workflow-runner.service';
import { AiActionType } from '@api/endpoints/ai-actions/dto/ai-action.dto';
import { AgentAdsResearchToolHandler } from '@api/services/agent-orchestrator/tools/agent-ads-research-tool-handler.service';
import { AgentAnalyticsToolHandler } from '@api/services/agent-orchestrator/tools/agent-analytics-tool-handler.service';
import { AgentBrandContentToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-content-tool-handler.service';
import { AgentBrandInterviewToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-interview-tool-handler.service';
import { AgentCampaignToolHandler } from '@api/services/agent-orchestrator/tools/agent-campaign-tool-handler.service';
import { AgentConnectionToolHandler } from '@api/services/agent-orchestrator/tools/agent-connection-tool-handler.service';
import { AgentDashboardToolHandler } from '@api/services/agent-orchestrator/tools/agent-dashboard-tool-handler.service';
import { AgentInstagramInspirationToolHandler } from '@api/services/agent-orchestrator/tools/agent-instagram-inspiration-tool-handler.service';
import { AgentLivestreamToolHandler } from '@api/services/agent-orchestrator/tools/agent-livestream-tool-handler.service';
import { AgentMediaAssetGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-asset-generation.service';
import { AgentMediaBatchGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-batch-generation.service';
import { AgentMediaGenerationToolHandler } from '@api/services/agent-orchestrator/tools/agent-media-generation-tool-handler.service';
import { AgentMediaTextGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-text-generation.service';
import { AgentMemoryGoalsToolHandler } from '@api/services/agent-orchestrator/tools/agent-memory-goals-tool-handler.service';
import { AgentOnboardingToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-tool-handler.service';
import { AgentPrepareToolHandler } from '@api/services/agent-orchestrator/tools/agent-prepare-tool-handler.service';
import { AgentProactiveToolHandler } from '@api/services/agent-orchestrator/tools/agent-proactive-tool-handler.service';
import { AgentPublishToolHandler } from '@api/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import { AgentQualityToolHandler } from '@api/services/agent-orchestrator/tools/agent-quality-tool-handler.service';
import { AgentReviewToolHandler } from '@api/services/agent-orchestrator/tools/agent-review-tool-handler.service';
import { AgentRouteRewriteService } from '@api/services/agent-orchestrator/tools/agent-route-rewrite.service';
import { AgentSpawnToolHandler } from '@api/services/agent-orchestrator/tools/agent-spawn-tool-handler.service';
import { AgentToolCatalogHandler } from '@api/services/agent-orchestrator/tools/agent-tool-catalog-handler.service';
import {
  AgentToolExecutorService,
  type ToolExecutionContext,
} from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentTrendsToolHandler } from '@api/services/agent-orchestrator/tools/agent-trends-tool-handler.service';
import { AgentWorkflowToolCreateService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-create.service';
import { AgentWorkflowToolExecuteService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-execute.service';
import { AgentWorkflowToolHandler } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-handler.service';
import { AgentWorkflowToolInstallService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-install.service';
import { AgentWorkspaceToolHandler } from '@api/services/agent-orchestrator/tools/agent-workspace-tool-handler.service';
import { AgentXActionsToolHandler } from '@api/services/agent-orchestrator/tools/agent-x-actions-tool-handler.service';
import type { CreateReleaseGroupInput } from '@api-types/contracts/scheduler.contract';
import {
  ApiKeyScope,
  IngredientCategory,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import { AgentToolName } from '@genfeedai/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Effect } from 'effect';

describe('AgentToolExecutorService', () => {
  const createWorkflowRunner = () => {
    const executors = new Map<string, SystemWorkflowActionExecutor>();
    const workflows = new Set<string>();
    return {
      registerAction: vi.fn(
        (actionId: string, executor: SystemWorkflowActionExecutor) => {
          executors.set(actionId, executor);
        },
      ),
      registerWorkflow: vi.fn((definition: { canonicalId: string }) => {
        workflows.add(definition.canonicalId);
      }),
      runWorkflow: vi.fn(
        async (request: {
          actionType: string;
          canonicalId: string;
          inputValues?: Record<string, unknown>;
          organizationId: string;
          runtimeContext?: unknown;
          userId?: string;
        }) => {
          if (!workflows.has(request.canonicalId)) {
            throw new Error(`Missing test workflow ${request.canonicalId}`);
          }
          const executor = executors.get(request.actionType);
          if (!executor) {
            throw new Error(`Missing test action ${request.actionType}`);
          }
          const provenance = {
            executionId: 'execution-1',
            workflowId: 'workflow-1',
            workflowLabel: request.canonicalId,
          };
          const result = await executor({
            context: {
              organizationId: request.organizationId,
              runId: 'run-1',
              userId: request.userId ?? testId('user'),
              workflowId: 'workflow-1',
              workflowVersionId: 'workflow-version-1',
            },
            input:
              request.inputValues?.parameters &&
              typeof request.inputValues.parameters === 'object' &&
              !Array.isArray(request.inputValues.parameters)
                ? (request.inputValues.parameters as Record<string, unknown>)
                : {},
            provenance,
            runtimeContext: request.runtimeContext,
          });
          return { provenance, result };
        },
      ),
    };
  };

  const scopedContext = (brandId: string): ToolExecutionContext => ({
    brandId,
    organizationId: testId('org'),
    threadId: testId('thread'),
    userId: testId('user'),
    validatedScope: {
      brandId,
      contextVersion: 3,
      isLegacyFallback: false,
      isVersionExplicit: true,
      organizationId: testId('org'),
      source: 'explicit',
      threadId: testId('thread'),
      userId: testId('user'),
    },
  });

  const createService = () => {
    const recurringWorkflowId = 'test-object-id';
    const loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    const configService = {
      ingredientsEndpoint: 'https://cdn.example.test/ingredients',
      get: vi.fn().mockReturnValue('http://localhost:3010'),
    };

    const postsService = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      handleYoutubePost: vi.fn(),
      patch: vi.fn(),
    };
    const postGroupsService = {
      create: vi
        .fn()
        .mockImplementation(
          (
            organizationId: string,
            _userId: string,
            input: CreateReleaseGroupInput,
            _headerIdempotencyKey?: string,
            _provenance?: Record<string, unknown>,
          ) =>
            Promise.resolve({
              id: 'release-1',
              organizationId,
              status: input.status,
              targets: input.targets.map((target, index) => ({
                executionState:
                  input.status === ReleaseStatus.SCHEDULED
                    ? 'scheduled'
                    : 'draft',
                id: `target-${index + 1}`,
                platform: target.platform,
              })),
            }),
        ),
      publishNow: vi.fn().mockResolvedValue({
        id: 'release-1',
        organizationId: testId('org'),
        status: ReleaseStatus.SCHEDULED,
        targets: [
          {
            executionState: 'scheduled',
            id: 'target-1',
            platform: 'linkedin',
          },
          {
            executionState: 'scheduled',
            id: 'target-2',
            platform: 'youtube',
          },
        ],
      }),
      scheduleTarget: vi.fn().mockResolvedValue({
        id: 'release-1',
        organizationId: testId('org'),
        status: ReleaseStatus.SCHEDULED,
        targets: [
          {
            executionState: 'scheduled',
            id: 'target-1',
            platform: 'linkedin',
            scheduledAt: '2099-07-18T09:00:00.000Z',
          },
        ],
      }),
    };
    const brandsService = {
      create: vi.fn().mockResolvedValue({ id: 'brand-1' }),
      findCreateByIdentityConfirmationSource: vi.fn().mockResolvedValue(null),
      findOne: vi.fn(),
      patch: vi.fn().mockResolvedValue({ id: 'brand-1' }),
      updateIdentityForOrganization: vi
        .fn()
        .mockResolvedValue({ id: 'brand-1' }),
      generateBrandVoice: vi.fn().mockResolvedValue({
        audience: ['founders', 'marketers'],
        doNotSoundLike: ['corporate jargon', 'broetry'],
        hashtags: ['#genfeed'],
        messagingPillars: ['clarity', 'speed', 'proof'],
        prompting: {
          conversationStarters: [
            {
              id: 'brand-create-clarity',
              intent: 'create',
              label: 'Create clarity',
              prompt: 'Create three posts about clarity.',
              topic: 'clarity',
            },
          ],
          seeds: [
            {
              angle: 'Practical guide',
              audience: 'founders',
              preferredFormats: ['post'],
              topic: 'clarity',
            },
          ],
        },
        sampleOutput: 'Clear systems beat noisy hustle.',
        strategy: {
          goals: ['Increase qualified leads'],
          topics: ['clarity', 'speed', 'proof'],
        },
        style: 'direct',
        taglines: ['Ship with signal'],
        tone: 'confident',
        values: ['clarity', 'speed'],
      }),
      updateAgentConfig: vi.fn().mockResolvedValue({ id: 'brand-1' }),
    };
    const livestreamBotId = testId('livestreambot');
    const botsService = {
      create: vi
        .fn()
        .mockImplementation(async (dto: Record<string, unknown>) => ({
          id: livestreamBotId,
          brandId: dto.brandId,
          category: dto.category,
          label: dto.label,
          livestreamSettings: dto.livestreamSettings,
          organizationId: dto.organizationId,
          platforms: dto.platforms,
          targets: dto.targets,
          userId: dto.userId,
        })),
      findOne: vi.fn().mockResolvedValue({
        id: livestreamBotId,
        brandId: testId('currentbrand'),
        category: 'livestream_chat',
        label: 'Launch Live Bot',
        livestreamSettings: { automaticPosting: true },
        organizationId: testId('org'),
        platforms: ['youtube'],
        targets: [
          {
            channelId: 'UC-live-1',
            isEnabled: true,
            platform: 'youtube',
          },
        ],
        userId: testId('user'),
      }),
    };
    const botsLivestreamService = {
      getOrCreateSession: vi.fn().mockResolvedValue({
        context: { source: 'none' },
        deliveryHistory: [],
        platformStates: [],
        status: 'stopped',
      }),
      pauseSession: vi.fn().mockResolvedValue({
        context: { source: 'none' },
        deliveryHistory: [],
        platformStates: [],
        status: 'paused',
      }),
      resumeSession: vi.fn().mockResolvedValue({
        context: { source: 'none' },
        deliveryHistory: [],
        platformStates: [],
        status: 'active',
      }),
      sendNow: vi.fn().mockResolvedValue({
        context: { source: 'none' },
        deliveryHistory: [{ id: 'delivery-1', message: 'Ship it' }],
        platformStates: [],
        status: 'stopped',
      }),
      setManualOverride: vi.fn().mockResolvedValue({
        context: {
          manualOverride: {
            promotionAngle: 'Urgency',
            topic: 'Launch day',
          },
          source: 'manual_override',
        },
        deliveryHistory: [],
        platformStates: [],
        status: 'stopped',
      }),
      startSession: vi.fn().mockResolvedValue({
        context: { source: 'none' },
        deliveryHistory: [],
        platformStates: [],
        status: 'active',
      }),
      stopSession: vi.fn().mockResolvedValue({
        context: { source: 'none' },
        deliveryHistory: [],
        platformStates: [],
        status: 'stopped',
      }),
    };
    const workflowSchedulerService = {
      updateSchedule: vi.fn(),
    };
    const workflowsService = {
      createWorkflow: vi.fn().mockResolvedValue({
        id: recurringWorkflowId,
        schedule: '0 17 * * *',
      }),
      cloneWorkflow: vi.fn().mockResolvedValue({
        id: 'workflow-copy-1',
        isScheduleEnabled: false,
        label: 'System Workflow (Copy)',
        status: 'draft',
      }),
      findAll: vi.fn().mockResolvedValue({ docs: [] }),
      findOne: vi.fn(),
      getWorkflowTemplates: vi.fn().mockResolvedValue([]),
      patch: vi.fn().mockResolvedValue({}),
    };
    const systemWorkflowCatalogService = {
      install: vi.fn().mockResolvedValue({ id: 'installed-system-workflow' }),
      listCatalogForOrganization: vi.fn().mockResolvedValue([]),
    };
    const workflowGenerationService = {
      generateWorkflowFromDescription: vi.fn().mockResolvedValue({
        tokensUsed: 321,
        workflow: {
          description: 'Generated workflow description',
          edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
          name: 'Generated Workflow',
          nodes: [
            {
              data: {
                config: { actionId: 'postGen', parameters: {} },
                label: 'Start',
              },
              id: 'node-1',
              position: { x: 0, y: 0 },
              type: 'genfeedAction',
            },
            {
              data: {
                config: { actionId: 'postGen', parameters: {} },
                label: 'Finish',
              },
              id: 'node-2',
              position: { x: 240, y: 0 },
              type: 'genfeedAction',
            },
          ],
        },
      }),
    };
    const marketplaceApiClient = {
      checkListingOwnership: vi.fn(),
      claimFreeItem: vi.fn(),
      getListing: vi.fn(),
      searchListings: vi.fn().mockResolvedValue({ docs: [] }),
    };
    const marketplaceInstallService = {
      installToWorkspace: vi.fn(),
    };
    const workflowExecutorService = {
      executeManualWorkflow: vi.fn().mockResolvedValue({
        executionId: 'exec-1',
        status: 'queued',
      }),
    };
    const workflowExecutionsService = {
      findAll: vi.fn().mockResolvedValue({ docs: [] }),
      findOne: vi.fn().mockResolvedValue(null),
    };
    const youtubeLongFormWorkflowService = {
      runAuthenticated: vi.fn(),
    };
    const trendsService = {
      getTrends: vi.fn().mockResolvedValue([]),
    };
    const aiActionsService = {
      execute: vi.fn().mockResolvedValue({
        result: 'ok',
        tokensUsed: 42,
      }),
    };
    const analyticsService = {
      getOverview: vi.fn().mockResolvedValue({
        avgEngagementRate: 4.3,
        growth: {
          engagement: 12.5,
          posts: 8.1,
          views: 14.2,
        },
        totalEngagement: 345,
        totalPosts: 12,
        totalViews: 4200,
      }),
    };
    const postAnalyticsService = {
      getPostAnalyticsSummary: vi.fn().mockResolvedValue({
        avgEngagementRate: 6.4,
        platforms: {},
        totalComments: 18,
        totalLikes: 92,
        totalSaves: 0,
        totalShares: 7,
        totalViews: 1200,
      }),
    };
    const contentGeneratorService = {} as never;
    const newslettersService = {
      generateDraft: vi.fn(),
    };
    const videosService = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    const creditsUtilsService = {
      addOrganizationCreditsWithExpiration: vi
        .fn()
        .mockResolvedValue(undefined),
      // Batch generation checks the balance and charges the estimate up
      // front (#2528); keep the balance high and the deduction inert so
      // pricing never blocks the tool-routing behavior under test.
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(1_000_000),
      getOrganizationCreditsWithExpiration: vi.fn().mockResolvedValue({
        credits: [],
        totalBalance: 0,
      }),
      releaseReservation: vi.fn().mockResolvedValue(undefined),
      reserveCredits: vi.fn().mockResolvedValue({ id: 'reservation-1' }),
    };
    const batchGenerationService = {
      approveItems: vi.fn(),
      createBatch: vi.fn().mockResolvedValue({
        id: testId('batch'),
        status: 'pending',
        totalCount: 10,
      }),
      getBatch: vi.fn(),
      getReviewInboxSummary: vi.fn(),
      processBatch: vi.fn().mockResolvedValue(undefined),
    };
    const batchGenerationWorkflowService = {
      queueBatch: vi.fn().mockResolvedValue('job-1'),
    };
    const batchCreditsService = {
      recordUpfrontCharge: vi.fn().mockResolvedValue(true),
      settleBatchCredits: vi.fn().mockResolvedValue({ settledCredits: 0 }),
    };
    const streamPublisher = {
      publishDone: vi.fn().mockResolvedValue(undefined),
      publishError: vi.fn().mockResolvedValue(undefined),
      publishInputRequest: vi.fn().mockResolvedValue(undefined),
      publishReasoning: vi.fn().mockResolvedValue(undefined),
      publishStreamStart: vi.fn().mockResolvedValue(undefined),
      publishToken: vi.fn().mockResolvedValue(undefined),
      publishTokenEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() => streamPublisher.publishToken(...args)).pipe(
          Effect.asVoid,
        ),
      ),
      publishToolComplete: vi.fn().mockResolvedValue(undefined),
      publishToolProgress: vi.fn().mockResolvedValue(undefined),
      publishToolProgressEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() =>
          streamPublisher.publishToolProgress(...args),
        ).pipe(Effect.asVoid),
      ),
      publishToolStart: vi.fn().mockResolvedValue(undefined),
      publishUIBlocks: vi.fn().mockResolvedValue(undefined),
      publishUIBlocksEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() => streamPublisher.publishUIBlocks(...args)).pipe(
          Effect.asVoid,
        ),
      ),
      publishWorkEvent: vi.fn().mockResolvedValue(undefined),
      publishWorkEventEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() => streamPublisher.publishWorkEvent(...args)).pipe(
          Effect.asVoid,
        ),
      ),
    };
    const credentialsService = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      resolveBrandAccount: vi.fn((options: Record<string, unknown>) =>
        credentialsService.findOne(options),
      ),
    };
    const organizationsService = {
      findOne: vi.fn().mockResolvedValue({ onboardingCompleted: false }),
      patch: vi.fn().mockResolvedValue({}),
    };
    const routeRewriteService = new AgentRouteRewriteService(
      loggerService,
      brandsService as never,
      organizationsService as never,
    );
    const organizationSettingsService = {
      findOne: vi.fn().mockResolvedValue({
        id: 'settings-1',
        onboardingJourneyMissions: [],
      }),
      getNextRecommendedJourneyMission: vi
        .fn()
        .mockReturnValue('complete_company_info'),
      normalizeJourneyState: vi.fn().mockImplementation(() => [
        {
          completedAt: null,
          id: 'complete_company_info',
          isCompleted: false,
          rewardClaimed: false,
          rewardCredits: 25,
        },
        {
          completedAt: null,
          id: 'connect_social_account',
          isCompleted: false,
          rewardClaimed: false,
          rewardCredits: 10,
        },
        {
          completedAt: null,
          id: 'generate_first_image',
          isCompleted: false,
          rewardClaimed: false,
          rewardCredits: 15,
        },
        {
          completedAt: null,
          id: 'generate_first_video',
          isCompleted: false,
          rewardClaimed: false,
          rewardCredits: 20,
        },
        {
          completedAt: null,
          id: 'publish_first_post',
          isCompleted: false,
          rewardClaimed: false,
          rewardCredits: 30,
        },
      ]),
      patch: vi.fn().mockResolvedValue({}),
    };
    const agentMemoryCaptureService = {
      capture: vi.fn().mockResolvedValue({
        memory: {
          id: 'memory-1',
          content: 'Write concise newsletters with a strong hook.',
          contentType: 'newsletter',
          kind: 'preference',
          scope: 'user',
          summary: 'Concise newsletter hook preference',
        },
        wroteBrandInsight: false,
        wroteContextMemory: true,
      }),
    };
    const usersService = {
      findOne: vi.fn().mockResolvedValue({ id: 'user-db-1' }),
      patch: vi.fn().mockResolvedValue({}),
    };
    const authProviderService = {
      getUser: vi.fn().mockResolvedValue({
        brandId: testId('brandfallback'),
      }),
      updateUserPublicMetadata: vi.fn().mockResolvedValue({}),
    };
    const agentGoalsService = {
      create: vi.fn().mockResolvedValue({
        currentValue: 250,
        id: 'goal-1',
        label: 'Grow views',
        metric: 'views',
        progressPercent: 25,
        targetValue: 1000,
      }),
      refreshProgress: vi.fn().mockResolvedValue({
        currentValue: 250,
        id: 'goal-1',
        label: 'Grow views',
        metric: 'views',
        progressPercent: 25,
        targetValue: 1000,
      }),
      update: vi.fn().mockResolvedValue({
        currentValue: 400,
        id: 'goal-1',
        label: 'Grow views',
        metric: 'views',
        progressPercent: 40,
        targetValue: 1000,
      }),
    };

    const campaignsService = {
      complete: vi.fn(),
      createScoped: vi.fn(),
      getAnalytics: vi.fn(),
      pause: vi.fn(),
      start: vi.fn(),
    };
    const campaignHandler = new AgentCampaignToolHandler(
      campaignsService as never,
    );
    const livestreamHandler = new AgentLivestreamToolHandler(
      brandsService as never,
      botsService as never,
      botsLivestreamService as never,
    );

    const imagesService = {
      findAllByOrganization: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
    };
    const voicesService = {
      findAll: vi.fn().mockResolvedValue({ docs: [] }),
    };
    const contentQualityScorerService = {
      scoreAndTag: vi.fn().mockResolvedValue({
        feedback: ['Solid composition'],
        score: 7,
        status: 'good',
      }),
      scoreContent: vi.fn().mockResolvedValue({
        category: 'good',
        contentType: 'image',
        feedback: ['Solid composition'],
        score: 7,
        suggestions: ['Increase contrast for better readability'],
      }),
    };
    const ingredientsService = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    const articlesService = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    const articleAnalyticsService = {
      getArticleAnalyticsSummary: vi.fn().mockResolvedValue(null),
    };
    const adsResearchService = {
      createRemixWorkflow: vi.fn().mockResolvedValue({
        adPack: {
          assetCreativeBrief: 'Adapt the winning hook for the brand.',
          campaignRecipe: {
            budgetStrategy: 'Paused budget for review.',
            channel: 'youtube',
            objective: 'Conversions',
            placements: ['YouTube Shorts'],
            platform: 'google',
            reviewStatus: 'review_required',
          },
          cta: 'Learn more',
          headlines: ['Brand: Winning YouTube angle'],
          primaryText: 'Lead with proof and clear intent.',
          targetingNotes: 'Target buyers already searching for the problem.',
        },
        reviewRequired: true,
        workflowDescription: 'Review the ad pack before any launch action.',
        workflowId: 'wf-ads-1',
        workflowName: 'Brand Google Ad Remix',
      }),
      generateAdPack: vi.fn().mockResolvedValue({
        assetCreativeBrief: 'Adapt the winning hook for the brand.',
        campaignRecipe: {
          budgetStrategy: 'Paused budget for review.',
          channel: 'youtube',
          objective: 'Conversions',
          placements: ['YouTube Shorts'],
          platform: 'google',
          reviewStatus: 'review_required',
        },
        cta: 'Learn more',
        headlines: ['Brand: Winning YouTube angle'],
        primaryText: 'Lead with proof and clear intent.',
        targetingNotes: 'Target buyers already searching for the problem.',
      }),
      getAdDetail: vi.fn().mockResolvedValue({
        body: 'Lead with immediate proof.',
        campaignName: 'Evergreen search winner',
        channel: 'youtube',
        creative: {
          body: 'Lead with immediate proof.',
          cta: 'Learn more',
          headline: 'Winning YouTube angle',
        },
        explanation: 'The promise is narrow and the proof lands quickly.',
        headline: 'Winning YouTube angle',
        id: 'public-ad-1',
        metrics: {
          ctr: 3.4,
          performanceScore: 91,
          roas: 2.8,
        },
        platform: 'google',
        source: 'public',
        sourceId: 'public-ad-1',
        title: 'Winning YouTube angle',
      }),
      listAds: vi.fn().mockResolvedValue({
        connectedAds: [
          {
            channel: 'youtube',
            explanation: 'Strong intent and clear proof.',
            id: 'connected:google:ad-2',
            metrics: {},
            platform: 'google',
            source: 'my_accounts',
            sourceId: 'ad-2',
            title: 'Connected YouTube ad',
          },
        ],
        filters: {
          industry: 'fitness',
          platform: 'google',
          source: 'all',
        },
        publicAds: [
          {
            channel: 'all',
            explanation: 'Strong problem-solution fit.',
            id: 'public-ad-1',
            metrics: {},
            platform: 'meta',
            source: 'public',
            sourceId: 'public-ad-1',
            title: 'Public niche winner',
          },
        ],
        summary: {
          connectedCount: 1,
          publicCount: 1,
          reviewPolicy: 'All remixes and launch prep remain paused for review.',
          selectedPlatform: 'google',
          selectedSource: 'all',
        },
      }),
      prepareCampaignForReview: vi.fn().mockResolvedValue({
        ad: {
          body: 'Lead with immediate proof.',
          callToAction: 'Learn more',
          headline: 'Winning YouTube angle',
          name: 'Brand Google Ad',
        },
        adPack: {
          assetCreativeBrief: 'Adapt the winning hook for the brand.',
          campaignRecipe: {
            budgetStrategy: 'Paused budget for review.',
            channel: 'youtube',
            objective: 'Conversions',
            placements: ['YouTube Shorts'],
            platform: 'google',
            reviewStatus: 'review_required',
          },
          cta: 'Learn more',
          headlines: ['Brand: Winning YouTube angle'],
          primaryText: 'Lead with proof and clear intent.',
          targetingNotes: 'Target buyers already searching for the problem.',
        },
        adSet: {
          name: 'Brand Audience',
          optimizationGoal: 'Conversions',
          targeting: {},
        },
        campaign: {
          name: 'Brand YouTube Campaign',
          objective: 'Conversions',
          status: 'PAUSED',
        },
        channel: 'youtube',
        notes: ['Human review required before launch.'],
        platform: 'google',
        publishMode: 'paused',
        reviewRequired: true,
        status: 'review_required',
        workflowId: 'wf-ads-1',
        workflowName: 'Brand Google Ad Remix',
      }),
    };
    const instagramInspirationService = {
      createInstagramRemixWorkflow: vi.fn().mockResolvedValue({
        reviewRequired: true,
        source: {
          ownerUsername: 'peer',
          permalink: 'https://www.instagram.com/reel/ABC123/',
          shortcode: 'ABC123',
        },
        status: 'draft',
        workflowDescription: 'Review the remix before generation.',
        workflowId: 'wf-instagram-1',
        workflowName: 'Genfeed Instagram Remix',
      }),
      getInstagramInspirationDetail: vi.fn().mockResolvedValue({
        degraded: false,
        posts: [],
        signals: { formats: [], hooks: [], pacing: [], styles: [] },
        source: 'live',
        username: 'peer',
      }),
      listInstagramInspiration: vi.fn().mockResolvedValue({
        accounts: [],
        degraded: false,
        seeds: ['creatorops'],
        source: 'live',
      }),
    };

    const brandInterviewService = {
      getCompleteness: vi.fn().mockResolvedValue({
        incompleteFieldKeys: ['audience', 'tone'],
        interviewableGapCount: 2,
        overallScore: 40,
      }),
      skipField: vi.fn().mockResolvedValue({
        completenessScore: 45,
        interviewId: 'interview-1',
        isComplete: false,
        nextQuestion: {
          fieldKey: 'tone',
          questionText: "What is your brand's tone?",
        },
        progress: { answeredCount: 1, skippedCount: 1, totalCount: 10 },
        status: 'in_progress',
      }),
      start: vi.fn().mockResolvedValue({
        brandId: testId('org'),
        completenessScore: 40,
        creditsCharged: 10,
        currentQuestion: {
          fieldKey: 'audience',
          questionText: 'Who is your target audience?',
        },
        interviewId: 'interview-1',
        progress: { answeredCount: 0, skippedCount: 0, totalCount: 10 },
        status: 'in_progress',
      }),
      submitAnswer: vi.fn().mockResolvedValue({
        completenessScore: 50,
        interviewId: 'interview-1',
        isComplete: false,
        nextQuestion: {
          fieldKey: 'tone',
          questionText: "What is your brand's tone?",
        },
        progress: { answeredCount: 1, skippedCount: 0, totalCount: 10 },
        status: 'in_progress',
      }),
    };

    const memoryGoalsHandler = new AgentMemoryGoalsToolHandler(
      agentMemoryCaptureService as never,
      agentGoalsService as never,
    );
    const dashboardHandler = new AgentDashboardToolHandler(
      undefined,
      streamPublisher as never,
    );
    const agentScopeContextService = {
      assertConsequentialBoundary: vi.fn().mockResolvedValue(undefined),
      assertResourceBrand: vi.fn(),
    };
    const postRepurposeService = { repurpose: vi.fn() };
    const agentStrategiesService = {
      findOne: vi.fn().mockResolvedValue({
        autonomyMode: 'AUTO_PUBLISH',
        publishPolicy: { autoPublishEnabled: true },
      }),
    };
    const agentPublishAuditsService = {
      createAudit: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    };
    const publishCacheService = {
      acquireLock: vi.fn(),
      get: vi.fn().mockResolvedValue(null),
      releaseLock: vi.fn(),
      set: vi.fn().mockResolvedValue(true),
    };
    const publishHandler = new AgentPublishToolHandler(
      postGroupsService as never,
      postsService as never,
      loggerService,
      ingredientsService as never,
      credentialsService as never,
      agentScopeContextService as never,
      postRepurposeService as never,
      creditsUtilsService as never,
      agentStrategiesService as never,
      agentPublishAuditsService as never,
      publishCacheService as never,
    );
    const instagramInspirationHandler =
      new AgentInstagramInspirationToolHandler(
        adsResearchService as never,
        brandsService as never,
        credentialsService as never,
        instagramInspirationService as never,
      );
    const brandInterviewHandler = new AgentBrandInterviewToolHandler(
      brandInterviewService as never,
    );
    const workspaceHandler = new AgentWorkspaceToolHandler(
      creditsUtilsService as never,
      brandsService as never,
      postsService as never,
      { listCharacterMentions: vi.fn().mockResolvedValue([]) } as never,
    );
    const reviewHandler = new AgentReviewToolHandler(
      batchGenerationService as never,
    );
    const adsResearchHandler = new AgentAdsResearchToolHandler(
      adsResearchService as never,
      brandsService as never,
    );
    const connectionHandler = new AgentConnectionToolHandler(
      credentialsService as never,
    );
    const trendsHandler = new AgentTrendsToolHandler(trendsService as never);
    const generationGateway = {
      generateArticle: vi.fn(),
      generateAvatarVideo: vi.fn(),
      generateImage: vi.fn(),
      generateMusic: vi.fn(),
      generateVideo: vi.fn(),
      generateVoice: vi.fn(),
      reframeImage: vi.fn(),
      upscaleImage: vi.fn(),
    };
    const twitterService = {
      getTweetById: vi.fn(),
      getUserTimelineByUsername: vi.fn(),
      repostTweet: vi.fn(),
      resolveBrandUserAccessToken: vi.fn(),
      searchRecentTweets: vi.fn(),
    };
    const proactiveHandler = new AgentProactiveToolHandler(
      loggerService,
      postsService as never,
      twitterService as never,
      batchGenerationService as never,
    );
    const xActionsHandler = new AgentXActionsToolHandler(
      loggerService,
      twitterService as never,
      credentialsService as never,
      batchGenerationService as never,
    );
    const onboardingHandler = new AgentOnboardingToolHandler(
      loggerService,
      configService as never,
      brandsService as never,
      postsService as never,
      creditsUtilsService as never,
      contentGeneratorService as never,
      generationGateway as never,
      credentialsService as never,
      imagesService as never,
      organizationsService as never,
      organizationSettingsService as never,
      usersService as never,
      videosService as never,
      streamPublisher as never,
    );
    const analyticsHandler = new AgentAnalyticsToolHandler(
      postsService as never,
      analyticsService as never,
      postAnalyticsService as never,
      publishHandler,
      ingredientsService as never,
      agentScopeContextService as never,
      articlesService as never,
      articleAnalyticsService as never,
    );
    const workflowCreateService = new AgentWorkflowToolCreateService(
      workflowsService as never,
      brandsService as never,
      workflowGenerationService as never,
    );
    const workflowInstallCacheService = {
      acquireLock: vi.fn(),
      get: vi.fn().mockResolvedValue(null),
      releaseLock: vi.fn(),
      set: vi.fn().mockResolvedValue(true),
    };
    const workflowHandler = new AgentWorkflowToolHandler(
      new AgentWorkflowToolInstallService(
        configService as never,
        workflowsService as never,
        brandsService as never,
        systemWorkflowCatalogService as never,
        workflowCreateService,
        marketplaceApiClient as never,
        marketplaceInstallService as never,
        workflowInstallCacheService as never,
      ),
      workflowCreateService,
      new AgentWorkflowToolExecuteService(
        workflowsService as never,
        workflowExecutorService as never,
        workflowSchedulerService as never,
        workflowExecutionsService as never,
        youtubeLongFormWorkflowService as never,
      ),
    );
    const mediaGenerationHandler = new AgentMediaGenerationToolHandler(
      new AgentMediaTextGenerationService(
        aiActionsService as never,
        contentGeneratorService as never,
        newslettersService as never,
        generationGateway as never,
      ),
      new AgentMediaAssetGenerationService(
        loggerService,
        configService as never,
        generationGateway as never,
        onboardingHandler,
        contentQualityScorerService as never,
      ),
      new AgentMediaBatchGenerationService(
        loggerService,
        brandsService as never,
        batchGenerationWorkflowService as never,
        batchGenerationService as never,
        credentialsService as never,
        creditsUtilsService as never,
        batchCreditsService as never,
      ),
    );
    const qualityHandler = new AgentQualityToolHandler(
      loggerService,
      contentQualityScorerService as never,
      undefined,
      ingredientsService as never,
      {} as never,
      imagesService as never,
    );
    const catalogHandler = new AgentToolCatalogHandler();
    const brandContentHandler = new AgentBrandContentToolHandler(
      loggerService,
      brandsService as never,
      batchGenerationService as never,
    );
    const prepareHandler = new AgentPrepareToolHandler(
      brandsService as never,
      workflowsService as never,
      organizationSettingsService as never,
      voicesService as never,
    );
    const spawnHandler = new AgentSpawnToolHandler(loggerService, undefined);

    const systemWorkflowRunner = createWorkflowRunner();
    const service = new AgentToolExecutorService(
      loggerService,
      routeRewriteService,
      memoryGoalsHandler,
      dashboardHandler,
      publishHandler,
      campaignHandler,
      livestreamHandler,
      instagramInspirationHandler,
      xActionsHandler,
      brandInterviewHandler,
      workspaceHandler,
      connectionHandler,
      trendsHandler,
      proactiveHandler,
      qualityHandler,
      reviewHandler,
      adsResearchHandler,
      onboardingHandler,
      analyticsHandler,
      workflowHandler,
      mediaGenerationHandler,
      catalogHandler,
      brandContentHandler,
      prepareHandler,
      spawnHandler,
      agentScopeContextService as never,
      undefined,
      systemWorkflowRunner as never,
    );
    service.onModuleInit();

    return {
      adsResearchService,
      agentScopeContextService,
      agentGoalsService,
      agentMemoryCaptureService,
      aiActionsService,
      brandInterviewService,
      analyticsService,
      batchGenerationService,
      batchGenerationWorkflowService,
      botsLivestreamService,
      botsService,
      brandsService,
      authProviderService,
      contentQualityScorerService,
      articleAnalyticsService,
      articlesService,
      credentialsService,
      creditsUtilsService,
      generationGateway,
      imagesService,
      ingredientsService,
      workflowSchedulerService,
      instagramInspirationHandler,
      instagramInspirationService,
      marketplaceApiClient,
      marketplaceInstallService,
      livestreamBotId: livestreamBotId.toString(),
      loggerService,
      organizationSettingsService,
      organizationsService,
      postAnalyticsService,
      postGroupsService,
      postRepurposeService,
      postsService,
      publishCacheService,
      recurringWorkflowId,
      service,
      streamPublisher,
      trendsService,
      twitterService,
      usersService,
      videosService,
      voicesService,
      workflowExecutionsService,
      workflowExecutorService,
      workflowGenerationService,
      workflowInstallCacheService,
      workflowsService,
      xActionsHandler,
    };
  };

  it('enforces an explicit generation mode over the model tool arguments', async () => {
    const { service } = createService();

    const result = await service.executeTool(
      AgentToolName.PREPARE_GENERATION,
      { generationType: 'video', prompt: 'Launch-day portrait' },
      {
        generationMode: 'image',
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      generationType: 'image',
      prompt: 'Launch-day portrait',
    });
    expect(result.nextActions?.[0]).toEqual(
      expect.objectContaining({ generationType: 'image' }),
    );
  });

  it('should create a goal via agent tool', async () => {
    const { agentGoalsService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.CREATE_GOAL,
      {
        label: 'Grow views',
        metric: 'views',
        targetValue: 1000,
      },
      {
        brandId: 'brand-1',
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(agentGoalsService.create).toHaveBeenCalled();
    expect(result.data).toEqual(
      expect.objectContaining({
        goalId: 'goal-1',
        progressPercent: 25,
      }),
    );
  });

  it('should list the live Genfeed tool catalog for operator questions', async () => {
    const { service } = createService();

    const result = await service.executeTool(
      AgentToolName.LIST_GENFEED_TOOLS,
      {
        category: 'workflow',
        includeParameters: true,
        limit: 5,
        query: 'workflow',
        surface: 'mcp',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.creditsUsed).toBe(0);

    const data = result.data as {
      counts: {
        bySurface: Record<string, number>;
        total: number;
      };
      returned: number;
      surface: string;
      tools: Array<{
        category: string;
        name: string;
        parameters?: Record<string, unknown>;
        surfaces: Record<string, boolean>;
      }>;
      truncated: boolean;
    };

    expect(data.surface).toBe('mcp');
    expect(data.returned).toBeLessThanOrEqual(5);
    expect(data.tools.length).toBeGreaterThan(0);
    expect(data.tools.every((tool) => tool.category === 'workflow')).toBe(true);
    expect(data.tools.every((tool) => tool.surfaces.mcp)).toBe(true);
    expect(data.tools.every((tool) => Boolean(tool.parameters))).toBe(true);
    expect(data.counts.bySurface.mcp).toBeGreaterThan(0);
    expect(data.counts.total).toBeGreaterThanOrEqual(data.returned);
    expect(typeof data.truncated).toBe('boolean');
  });

  it('should reject invalid goal ids for progress checks', async () => {
    const { service } = createService();

    const result = await service.executeTool(
      AgentToolName.CHECK_GOAL_PROGRESS,
      { goalId: 'not-an-object-id' },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('valid goalId');
  });

  it('should update a goal via agent tool', async () => {
    const { agentGoalsService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.UPDATE_GOAL,
      {
        goalId: testId('goal'),
        targetValue: 1000,
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(agentGoalsService.update).toHaveBeenCalled();
    expect(result.data).toEqual(
      expect.objectContaining({
        goalId: 'goal-1',
        progressPercent: 40,
      }),
    );
  });

  it('preserves a naive wall time in the publish confirmation preview', async () => {
    const { credentialsService, ingredientsService, service } = createService();

    ingredientsService.findOne.mockResolvedValue({
      id: testId('ingredient'),
      brandId: testId('brand'),
      category: 'image',
    });
    credentialsService.find.mockResolvedValue([
      {
        id: testId('credentiallinkedin1'),
        platform: 'linkedin',
      },
      {
        id: testId('credentialtwitter'),
        platform: 'twitter',
      },
    ]);

    const result = await service.executeTool(
      AgentToolName.CREATE_POST,
      {
        caption: 'Ship this now',
        contentId: testId('ingredient'),
        scheduledAt: '2026-07-18T09:00',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.creditsUsed).toBe(0);
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        contentId: testId('ingredient'),
        platforms: ['linkedin', 'twitter'],
        scheduledAt: '2026-07-18T09:00',
        textContent: 'Ship this now',
        type: 'publish_post_card',
      }),
    ]);
  });

  it('schedules a canonical release target through the approval-backed scheduler', async () => {
    const { postGroupsService, postsService, service } = createService();
    postsService.findOne.mockResolvedValue({
      brandId: testId('brand'),
      groupId: 'release-1',
      id: 'target-1',
    });

    const result = await service.executeTool(
      AgentToolName.SCHEDULE_POST,
      {
        postId: 'target-1',
        scheduledAt: '2099-07-18T09:00:00.000Z',
      },
      scopedContext(testId('brand')),
    );

    expect(result).toEqual(
      expect.objectContaining({
        creditsUsed: 1,
        data: expect.objectContaining({
          id: 'target-1',
          releaseId: 'release-1',
          scheduledAt: '2099-07-18T09:00:00.000Z',
        }),
        success: true,
      }),
    );
    expect(postGroupsService.scheduleTarget).toHaveBeenCalledWith(
      testId('org'),
      testId('user'),
      'release-1',
      'target-1',
      '2099-07-18T09:00:00.000Z',
      expect.objectContaining({
        agentContextSource: 'explicit',
        agentContextVersion: 3,
        agentThreadId: testId('thread'),
      }),
    );
    expect(postsService.patch).not.toHaveBeenCalled();
  });

  it('fails closed with a remediation action for a legacy standalone draft', async () => {
    const { postGroupsService, postsService, service } = createService();
    postsService.findOne.mockResolvedValue({
      brandId: testId('brand'),
      id: 'legacy-post-1',
    });

    const result = await service.executeTool(
      AgentToolName.SCHEDULE_POST,
      {
        postId: 'legacy-post-1',
        scheduledAt: '2099-07-18T09:00:00.000Z',
      },
      scopedContext(testId('brand')),
    );

    expect(result).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          requiredAction: 'create_canonical_release',
        }),
        error: expect.stringContaining('legacy standalone draft'),
        nextActions: [
          expect.objectContaining({
            ctas: [{ href: '/content/posts', label: 'Open posts' }],
            type: 'schedule_post_card',
          }),
        ],
        success: false,
      }),
    );
    expect(postGroupsService.scheduleTarget).not.toHaveBeenCalled();
    expect(postsService.patch).not.toHaveBeenCalled();
  });

  it('returns an actionable fail-closed result when canonical scheduling validation rejects', async () => {
    const { postGroupsService, postsService, service } = createService();
    postsService.findOne.mockResolvedValue({
      brandId: testId('brand'),
      groupId: 'release-1',
      id: 'target-1',
    });
    postGroupsService.scheduleTarget.mockRejectedValue(
      new BadRequestException('Credential cred-1 is not connected.'),
    );

    const result = await service.executeTool(
      AgentToolName.SCHEDULE_POST,
      {
        postId: 'target-1',
        scheduledAt: '2099-07-18T09:00:00.000Z',
      },
      scopedContext(testId('brand')),
    );

    expect(result).toEqual(
      expect.objectContaining({
        creditsUsed: 0,
        error: 'Credential cred-1 is not connected.',
        nextActions: [
          expect.objectContaining({
            ctas: [{ href: '/content/posts', label: 'Review post setup' }],
            type: 'schedule_post_card',
          }),
        ],
        success: false,
      }),
    );
    expect(postsService.patch).not.toHaveBeenCalled();
  });

  it('repurposes a post deterministically at no credit cost', async () => {
    const { creditsUtilsService, postRepurposeService, postsService, service } =
      createService();
    postsService.findOne.mockResolvedValue({
      brandId: testId('brand'),
      id: 'source-post-1',
    });
    postRepurposeService.repurpose.mockResolvedValue({
      adjustments: [
        {
          code: 'channel_repurpose.caption_truncated',
          message: 'Caption shortened to fit the X (Twitter) limit of 280.',
        },
      ],
      draft: { id: 'repurposed-draft-1' },
    });

    const result = await service.executeTool(
      AgentToolName.REPURPOSE_POST,
      {
        mode: 'deterministic',
        platform: 'twitter',
        postId: 'source-post-1',
      },
      scopedContext(testId('brand')),
    );

    expect(result).toEqual(
      expect.objectContaining({
        creditsUsed: 0,
        data: expect.objectContaining({
          id: 'repurposed-draft-1',
          mode: 'deterministic',
          platform: 'twitter',
          status: 'draft',
        }),
        isBillingDelegated: true,
        success: true,
      }),
    );
    expect(postRepurposeService.repurpose).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'deterministic',
        organizationId: testId('org'),
        platform: 'twitter',
        postId: 'source-post-1',
        userId: testId('user'),
      }),
    );
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
  });

  it('bills the agent-mode repurpose rewrite and returns the review reference', async () => {
    const { creditsUtilsService, postRepurposeService, postsService, service } =
      createService();
    postsService.findOne.mockResolvedValue({
      brandId: testId('brand'),
      id: 'source-post-1',
    });
    postRepurposeService.repurpose.mockResolvedValue({
      adjustments: [],
      draft: { id: 'repurposed-draft-2' },
      reviewBatchId: 'batch-1',
      reviewItemId: 'item-1',
    });

    const result = await service.executeTool(
      AgentToolName.REPURPOSE_POST,
      {
        mode: 'agent',
        platform: 'linkedin',
        postId: 'source-post-1',
      },
      scopedContext(testId('brand')),
    );

    expect(result).toEqual(
      expect.objectContaining({
        creditsUsed: 1,
        data: expect.objectContaining({
          id: 'repurposed-draft-2',
          mode: 'agent',
          reviewBatchId: 'batch-1',
          reviewItemId: 'item-1',
        }),
        isBillingDelegated: true,
        success: true,
      }),
    );
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      testId('org'),
      testId('user'),
      1,
      expect.stringContaining('source-post-1'),
      expect.anything(),
    );
  });

  it('returns the actionable validation detail when repurposing rejects', async () => {
    const { postRepurposeService, postsService, service } = createService();
    postsService.findOne.mockResolvedValue({
      brandId: testId('brand'),
      id: 'source-post-1',
    });
    postRepurposeService.repurpose.mockRejectedValue(
      new BadRequestException({
        detail: 'X (Twitter) does not support carousel media.',
        title: 'Post cannot be repurposed to this channel',
      }),
    );

    const result = await service.executeTool(
      AgentToolName.REPURPOSE_POST,
      {
        mode: 'deterministic',
        platform: 'twitter',
        postId: 'source-post-1',
      },
      scopedContext(testId('brand')),
    );

    expect(result).toEqual(
      expect.objectContaining({
        creditsUsed: 0,
        error: 'X (Twitter) does not support carousel media.',
        success: false,
      }),
    );
  });

  it('withholds internal repurpose failures from model-visible output', async () => {
    const { loggerService, postRepurposeService, postsService, service } =
      createService();
    postsService.findOne.mockResolvedValue({
      brandId: testId('brand'),
      id: 'source-post-1',
    });
    postRepurposeService.repurpose.mockRejectedValue(
      new Error('Prisma connection detail with internal host'),
    );

    const result = await service.executeTool(
      AgentToolName.REPURPOSE_POST,
      {
        mode: 'agent',
        platform: 'twitter',
        postId: 'source-post-1',
      },
      scopedContext(testId('brand')),
    );

    expect(result.success).toBe(false);
    expect(result.error).not.toContain('Prisma');
    expect(loggerService.error).toHaveBeenCalledWith(
      expect.stringContaining('Prisma connection detail'),
      'AgentPublishToolHandler',
    );
  });

  it('requires postId, platform, and mode before repurposing', async () => {
    const { postRepurposeService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.REPURPOSE_POST,
      { platform: 'twitter', postId: 'source-post-1' },
      scopedContext(testId('brand')),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('mode');
    expect(postRepurposeService.repurpose).not.toHaveBeenCalled();
  });

  it('logs unexpected canonical scheduling failures without exposing internal details', async () => {
    const { loggerService, postGroupsService, postsService, service } =
      createService();
    postsService.findOne.mockResolvedValue({
      brandId: testId('brand'),
      groupId: 'release-1',
      id: 'target-1',
    });
    postGroupsService.scheduleTarget.mockRejectedValue(
      new Error('Prisma connection detail with internal host'),
    );

    const result = await service.executeTool(
      AgentToolName.SCHEDULE_POST,
      {
        postId: 'target-1',
        scheduledAt: '2099-07-18T09:00:00.000Z',
      },
      scopedContext(testId('brand')),
    );

    expect(result).toEqual(
      expect.objectContaining({
        error: 'The canonical release target could not be scheduled safely.',
        success: false,
      }),
    );
    expect(result.error).not.toContain('Prisma');
    expect(loggerService.error).toHaveBeenCalledWith(
      expect.stringContaining('Prisma connection detail'),
      'AgentPublishToolHandler',
    );
  });

  it('does not expose 5xx HTTP exception details from canonical scheduling', async () => {
    const { loggerService, postGroupsService, postsService, service } =
      createService();
    postsService.findOne.mockResolvedValue({
      brandId: testId('brand'),
      groupId: 'release-1',
      id: 'target-1',
    });
    postGroupsService.scheduleTarget.mockRejectedValue(
      new InternalServerErrorException('Database host is db.internal'),
    );

    const result = await service.executeTool(
      AgentToolName.SCHEDULE_POST,
      {
        postId: 'target-1',
        scheduledAt: '2099-07-18T09:00:00.000Z',
      },
      scopedContext(testId('brand')),
    );

    expect(result).toEqual(
      expect.objectContaining({
        error: 'The canonical release target could not be scheduled safely.',
        success: false,
      }),
    );
    expect(result.error).not.toContain('db.internal');
    expect(loggerService.error).toHaveBeenCalled();
  });

  it('fails closed when the canonical scheduler omits the scheduled target', async () => {
    const { postGroupsService, postsService, service } = createService();
    postsService.findOne.mockResolvedValue({
      brandId: testId('brand'),
      groupId: 'release-1',
      id: 'target-1',
    });
    postGroupsService.scheduleTarget.mockResolvedValue({
      id: 'release-1',
      organizationId: testId('org'),
      status: ReleaseStatus.SCHEDULED,
      targets: [],
    });

    const result = await service.executeTool(
      AgentToolName.SCHEDULE_POST,
      {
        postId: 'target-1',
        scheduledAt: '2099-07-18T09:00:00.000Z',
      },
      scopedContext(testId('brand')),
    );

    expect(result).toEqual(
      expect.objectContaining({
        error:
          'Canonical scheduler did not return the scheduled release target.',
        success: false,
      }),
    );
  });

  it('fails closed when the canonical scheduler returns an unscheduled target', async () => {
    const { postGroupsService, postsService, service } = createService();
    postsService.findOne.mockResolvedValue({
      brandId: testId('brand'),
      groupId: 'release-1',
      id: 'target-1',
    });
    postGroupsService.scheduleTarget.mockResolvedValue({
      id: 'release-1',
      organizationId: testId('org'),
      status: ReleaseStatus.DRAFT,
      targets: [
        {
          executionState: 'draft',
          id: 'target-1',
          platform: 'linkedin',
        },
      ],
    });

    const result = await service.executeTool(
      AgentToolName.SCHEDULE_POST,
      {
        postId: 'target-1',
        scheduledAt: '2099-07-18T09:00:00.000Z',
      },
      scopedContext(testId('brand')),
    );

    expect(result).toEqual(
      expect.objectContaining({
        error:
          'Canonical scheduler did not return the scheduled release target.',
        success: false,
      }),
    );
  });

  it('sanitizes unexpected post lookup failures before canonical scheduling', async () => {
    const { loggerService, postsService, service } = createService();
    postsService.findOne.mockRejectedValue(
      new Error('Post query failed against db.internal'),
    );

    const result = await service.executeTool(
      AgentToolName.SCHEDULE_POST,
      {
        postId: 'target-1',
        scheduledAt: '2099-07-18T09:00:00.000Z',
      },
      scopedContext(testId('brand')),
    );

    expect(result).toEqual(
      expect.objectContaining({
        error: 'The canonical release target could not be scheduled safely.',
        success: false,
      }),
    );
    expect(result.error).not.toContain('db.internal');
    expect(loggerService.error).toHaveBeenCalled();
  });

  it('rejects invalid schedule timestamps before loading a post', async () => {
    const { postsService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.SCHEDULE_POST,
      { postId: 'target-1', scheduledAt: 'not-a-date' },
      scopedContext(testId('brand')),
    );

    expect(result).toEqual(
      expect.objectContaining({
        error:
          'scheduledAt must be a valid ISO 8601 date and time with an explicit UTC offset.',
        success: false,
      }),
    );
    expect(postsService.findOne).not.toHaveBeenCalled();
  });

  it('rejects schedule timestamps without an explicit UTC offset', async () => {
    const { postsService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.SCHEDULE_POST,
      { postId: 'target-1', scheduledAt: '2099-07-18T09:00:00' },
      scopedContext(testId('brand')),
    );

    expect(result).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('explicit UTC offset'),
        success: false,
      }),
    );
    expect(postsService.findOne).not.toHaveBeenCalled();
  });

  it('returns a generic integrations card when connection status has no platform', async () => {
    const { credentialsService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.GET_CONNECTION_STATUS,
      {},
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(credentialsService.findOne).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        connected: false,
        credentialId: null,
        platform: null,
      }),
    );
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        ctas: [
          expect.objectContaining({
            href: '/settings/api-keys?returnTo=%2Fagent',
            label: 'Open integrations',
          }),
        ],
        title: 'Choose an integration',
        type: 'oauth_connect_card',
      }),
    ]);
  });

  it('returns a generic integrations card when initiating oauth without a platform', async () => {
    const { service } = createService();

    const result = await service.executeTool(
      AgentToolName.INITIATE_OAUTH_CONNECT,
      {},
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        platform: null,
        returnTo: '/agent',
      }),
    );
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        ctas: [
          expect.objectContaining({
            href: '/settings/api-keys?returnTo=%2Fagent',
            label: 'Open integrations',
          }),
        ],
        title: 'Choose an integration',
        type: 'oauth_connect_card',
      }),
    ]);
  });

  it('scopes organization-level tool hrefs with the active organization slug', async () => {
    const { organizationsService, service } = createService();

    organizationsService.findOne.mockResolvedValueOnce({
      id: testId('org'),
      slug: 'genfeed-ai',
    });

    const result = await service.executeTool(
      AgentToolName.INITIATE_OAUTH_CONNECT,
      {},
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.nextActions?.[0].ctas).toEqual([
      expect.objectContaining({
        href: '/genfeed-ai/~/settings/api-keys?returnTo=%2Fagent',
        label: 'Open integrations',
      }),
    ]);
  });

  it('scopes brand-level tool hrefs with organization and brand slugs', async () => {
    const { analyticsService, brandsService, organizationsService, service } =
      createService();

    organizationsService.findOne.mockResolvedValueOnce({
      id: testId('org'),
      slug: 'genfeed-ai',
    });
    brandsService.findOne.mockResolvedValueOnce({
      id: testId('goal'),
      slug: 'my-brand',
    });

    const result = await service.executeTool(
      AgentToolName.GET_ANALYTICS,
      { period: '30d' },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(analyticsService.getOverview).toHaveBeenCalled();
    expect(result.nextActions?.[0].ctas).toEqual([
      expect.objectContaining({
        href: '/genfeed-ai/my-brand/analytics/overview',
        label: 'Open analytics',
      }),
    ]);
  });

  it('lists ads research results and returns an ads card', async () => {
    const { adsResearchService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.LIST_ADS_RESEARCH,
      {
        industry: 'fitness',
        platform: 'google',
        source: 'all',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(adsResearchService.listAds).toHaveBeenCalled();
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ title: 'Public niche winner' }),
          expect.objectContaining({ title: 'Connected YouTube ad' }),
        ]),
        type: 'ads_search_results_card',
      }),
    ]);
  });

  it('lists posts with the canonical organizationId filter', async () => {
    const { postsService, service } = createService();
    postsService.findAll.mockResolvedValue({ docs: [] });

    const result = await service.executeTool(
      AgentToolName.LIST_POSTS,
      { executionState: TargetExecutionState.DRAFT },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(postsService.findAll).toHaveBeenCalledWith(
      {
        orderBy: { createdAt: -1 },
        where: {
          isDeleted: false,
          organizationId: testId('org'),
          targetExecutionState: TargetExecutionState.DRAFT,
        },
      },
      { limit: 10 },
    );
  });

  it('lists Instagram inspiration for the selected organization brand', async () => {
    const {
      brandsService,
      credentialsService,
      instagramInspirationService,
      service,
    } = createService();
    brandsService.findOne.mockResolvedValueOnce({
      agentConfig: {
        strategy: { topics: ['creator systems'] },
        voice: { audience: ['founders'], hashtags: ['creatorops'] },
      },
      id: testId('goal'),
      isSelected: true,
      label: 'Genfeed',
    });
    credentialsService.findOne.mockResolvedValueOnce({
      externalHandle: 'genfeed',
    });

    const result = await service.executeTool(
      AgentToolName.LIST_INSTAGRAM_INSPIRATION,
      { sort: 'latest' },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(brandsService.findOne).toHaveBeenCalledWith({
      isSelected: true,
      organizationId: testId('org'),
      userId: testId('user'),
    });
    expect(
      instagramInspirationService.listInstagramInspiration,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: expect.objectContaining({
          id: testId('goal'),
          organizationId: testId('org'),
          ownUsername: 'genfeed',
        }),
        sort: 'latest',
      }),
    );
  });

  it('rejects Instagram remix creation when no brand is selected', async () => {
    const { instagramInspirationService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.CREATE_INSTAGRAM_REMIX_WORKFLOW,
      { shortcode: 'ABC123', username: 'peer' },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No brand is currently selected');
    expect(
      instagramInspirationService.createInstagramRemixWorkflow,
    ).not.toHaveBeenCalled();
  });

  it('rejects an explicit Instagram inspiration brand outside the organization', async () => {
    const { brandsService, instagramInspirationService, service } =
      createService();

    const result = await service.executeTool(
      AgentToolName.LIST_INSTAGRAM_INSPIRATION,
      { brandId: testId('thread') },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: testId('thread'),
      organizationId: testId('org'),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain(
      'requested brand was not found in this organization',
    );
    expect(
      instagramInspirationService.listInstagramInspiration,
    ).not.toHaveBeenCalled();
  });

  it('creates a review-only Instagram remix workflow for an explicit organization brand', async () => {
    const { brandsService, instagramInspirationService, service } =
      createService();
    brandsService.findOne.mockResolvedValueOnce({
      id: testId('goal'),
      label: 'Genfeed',
    });

    const result = await service.executeTool(
      AgentToolName.CREATE_INSTAGRAM_REMIX_WORKFLOW,
      {
        brandId: testId('goal'),
        mode: 'remix_concept',
        shortcode: 'ABC123',
        username: 'peer',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: testId('goal'),
      organizationId: testId('org'),
    });
    expect(
      instagramInspirationService.createInstagramRemixWorkflow,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'remix_concept',
        shortcode: 'ABC123',
        username: 'peer',
      }),
    );
    expect(result).toMatchObject({
      data: { reviewRequired: true, status: 'draft' },
      success: true,
    });
  });

  it('creates an ad remix workflow and returns a workflow card', async () => {
    const { adsResearchService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.CREATE_AD_REMIX_WORKFLOW,
      {
        adId: 'public-ad-1',
        objective: 'Conversions',
        source: 'public',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(adsResearchService.createRemixWorkflow).toHaveBeenCalled();
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        type: 'workflow_created_card',
        workflowId: 'wf-ads-1',
        workflowName: 'Brand Google Ad Remix',
      }),
    ]);
  });

  it('prepares ad launch review and keeps it in review-required state', async () => {
    const { adsResearchService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.PREPARE_AD_LAUNCH_REVIEW,
      {
        adId: 'public-ad-1',
        createWorkflow: true,
        source: 'public',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(adsResearchService.prepareCampaignForReview).toHaveBeenCalled();
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        type: 'campaign_launch_prep_card',
      }),
    ]);
  });

  it('publishes accessible content through the canonical release queue after confirmation', async () => {
    const {
      credentialsService,
      ingredientsService,
      postGroupsService,
      postsService,
      publishCacheService,
      service,
    } = createService();

    ingredientsService.findOne.mockResolvedValue({
      id: testId('ingredientvideo'),
      brandId: testId('brandvideo'),
      category: IngredientCategory.VIDEO,
    });
    credentialsService.find.mockResolvedValue([
      {
        id: testId('credentiallinkedin2'),
        platform: 'linkedin',
      },
      {
        id: testId('credentialyoutube'),
        platform: 'youtube',
      },
    ]);
    publishCacheService.get.mockResolvedValueOnce({
      organizationId: testId('org'),
      sourceActionId: 'publish-card-1',
      threadId: testId('thread'),
      toolName: AgentToolName.CREATE_POST,
    });
    const result = await service.executeTool(
      AgentToolName.CREATE_POST,
      {
        caption: 'Published from chat',
        contentId: testId('ingredientvideo'),
        platforms: ['linkedin', 'youtube'],
        sourceActionId: 'publish-card-1',
      },
      {
        ...scopedContext(testId('brandvideo')),
        confirmationOrigin: 'thread-ui-action',
        runId: testId('run'),
        strategyId: testId('strategy'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.creditsUsed).toBe(0);
    expect(postGroupsService.create).toHaveBeenCalledWith(
      testId('org'),
      testId('user'),
      expect.objectContaining({
        baseContent: 'Published from chat',
        brandId: testId('brandvideo'),
        media: [
          {
            assetId: testId('ingredientvideo'),
            kind: 'video',
          },
        ],
        status: ReleaseStatus.DRAFT,
        targets: [
          expect.objectContaining({
            credentialId: testId('credentiallinkedin2'),
            platform: 'linkedin',
          }),
          expect.objectContaining({
            credentialId: testId('credentialyoutube'),
            platform: 'youtube',
          }),
        ],
      }),
      expect.stringMatching(/^agent-publish:[a-f0-9]{64}$/),
      expect.objectContaining({
        workflowExecutionId: testId('run'),
        agentStrategyId: testId('strategy'),
        agentThreadId: testId('thread'),
        source: 'agent',
        sourceActionId: 'publish-card-1',
      }),
    );
    expect(postGroupsService.publishNow).toHaveBeenCalledWith(
      testId('org'),
      testId('user'),
      'release-1',
    );
    expect(postsService.create).not.toHaveBeenCalled();
    expect(postsService.handleYoutubePost).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      contentId: testId('ingredientvideo'),
      createdPlatforms: ['linkedin', 'youtube'],
      postIds: ['target-1', 'target-2'],
      totalCreated: 2,
    });
  });

  it('reports a failed publish when the release is blocked by channel readiness', async () => {
    const {
      credentialsService,
      ingredientsService,
      postGroupsService,
      postsService,
      publishCacheService,
      service,
    } = createService();

    ingredientsService.findOne.mockResolvedValue({
      brandId: testId('brandvideo'),
      category: 'image',
      id: testId('ingredientvideo'),
    });
    credentialsService.find.mockResolvedValue([
      {
        id: testId('credentiallinkedin2'),
        platform: 'linkedin',
      },
    ]);
    // The immediate-publish path saves an ungated draft first, so readiness is
    // enforced by publishNow — the agent must surface that rejection, not a
    // queued publish.
    postGroupsService.publishNow.mockRejectedValue(
      new BadRequestException({
        classification: 'expired_credential',
        credentialId: testId('credentiallinkedin2'),
        platform: 'linkedin',
        readinessState: 'blocked',
        title: 'Channel not ready to publish',
      }),
    );

    publishCacheService.get.mockResolvedValueOnce({
      organizationId: testId('org'),
      sourceActionId: 'publish-card-blocked',
      threadId: testId('thread'),
      toolName: AgentToolName.CREATE_POST,
    });

    const result = await service.executeTool(
      AgentToolName.CREATE_POST,
      {
        contentId: testId('ingredientvideo'),
        platforms: ['linkedin'],
        sourceActionId: 'publish-card-blocked',
      },
      {
        ...scopedContext(testId('brandvideo')),
        confirmationOrigin: 'thread-ui-action',
        strategyId: testId('strategy'),
      },
    );

    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(postGroupsService.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ status: ReleaseStatus.DRAFT }),
      expect.any(String),
      expect.any(Object),
    );
    expect(postGroupsService.publishNow).toHaveBeenCalled();
    expect(postsService.create).not.toHaveBeenCalled();
  });

  it('rejects direct publishing at the executor boundary for an under-scoped API key', async () => {
    const { postGroupsService, postsService, service } = createService();

    await expect(
      service.executeTool(
        AgentToolName.CREATE_POST,
        {
          confirmed: true,
          contentId: 42,
          platforms: ['linkedin'],
        },
        {
          ...scopedContext(testId('brandvideo')),
          apiKeyContext: {
            isApiKey: true,
            scopes: [ApiKeyScope.POSTS_CREATE],
          },
        },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
        requiredScopes: [ApiKeyScope.POSTS_PUBLISH],
      }),
    });
    expect(postGroupsService.create).not.toHaveBeenCalled();
    expect(postGroupsService.publishNow).not.toHaveBeenCalled();
    expect(postsService.create).not.toHaveBeenCalled();
  });

  it('creates a scheduled canonical release without publishing it early', async () => {
    const {
      credentialsService,
      ingredientsService,
      postGroupsService,
      publishCacheService,
      service,
    } = createService();
    ingredientsService.findOne.mockResolvedValue({
      assetLabel: 'promo',
      brandId: testId('brandvideo'),
      category: 'image',
      id: testId('ingredientvideo'),
    });
    credentialsService.find.mockResolvedValue([
      {
        id: testId('credentiallinkedin2'),
        platform: 'instagram',
      },
    ]);
    postGroupsService.create.mockResolvedValueOnce({
      id: 'release-scheduled',
      organizationId: testId('org'),
      status: ReleaseStatus.SCHEDULED,
      targets: [
        {
          executionState: 'scheduled',
          id: 'target-scheduled',
          platform: 'instagram',
        },
      ],
    });
    const expectedScheduledAt = new Date('2026-07-18T09:00').toISOString();
    publishCacheService.get.mockResolvedValueOnce({
      organizationId: testId('org'),
      sourceActionId: 'publish-card-scheduled',
      threadId: testId('thread'),
      toolName: AgentToolName.CREATE_POST,
    });

    const result = await service.executeTool(
      AgentToolName.CREATE_POST,
      {
        contentId: testId('ingredientvideo'),
        platforms: ['instagram'],
        scheduledAt: '2026-07-18T09:00',
        sourceActionId: 'publish-card-scheduled',
      },
      {
        ...scopedContext(testId('brandvideo')),
        confirmationOrigin: 'thread-ui-action',
      },
    );

    expect(result.success).toBe(true);
    expect(postGroupsService.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        baseContent: 'promo',
        scheduledDate: expectedScheduledAt,
        status: ReleaseStatus.SCHEDULED,
        targets: [
          expect.objectContaining({
            scheduledDate: expectedScheduledAt,
          }),
        ],
      }),
      expect.stringMatching(/^agent-publish:[a-f0-9]{64}$/),
      expect.any(Object),
    );
    expect(postGroupsService.publishNow).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      postIds: ['target-scheduled'],
      scheduledAt: expectedScheduledAt,
      totalCreated: 1,
    });
  });

  it('reuses the same release idempotency key for an exact confirmed-action retry', async () => {
    const {
      credentialsService,
      ingredientsService,
      postGroupsService,
      publishCacheService,
      service,
    } = createService();
    ingredientsService.findOne.mockResolvedValue({
      brandId: testId('brandvideo'),
      category: 'image',
      id: testId('ingredientvideo'),
    });
    credentialsService.find.mockResolvedValue([
      {
        id: testId('credentiallinkedin2'),
        platform: 'linkedin',
      },
    ]);
    postGroupsService.publishNow.mockResolvedValue({
      id: 'release-1',
      organizationId: testId('org'),
      status: ReleaseStatus.SCHEDULED,
      targets: [
        {
          executionState: 'scheduled',
          id: 'target-1',
          platform: 'linkedin',
        },
      ],
    });
    const parameters = {
      caption: 'Retry-safe caption',
      contentId: testId('ingredientvideo'),
      platforms: ['linkedin'],
      sourceActionId: 'publish-card-retry',
    };
    const context: ToolExecutionContext = {
      ...scopedContext(testId('brandvideo')),
      confirmationOrigin: 'thread-ui-action',
    };
    publishCacheService.get.mockImplementation(async () => ({
      organizationId: testId('org'),
      sourceActionId: 'publish-card-retry',
      threadId: testId('thread'),
      toolName: AgentToolName.CREATE_POST,
    }));

    await service.executeTool(AgentToolName.CREATE_POST, parameters, context);
    await service.executeTool(AgentToolName.CREATE_POST, parameters, context);
    publishCacheService.get.mockResolvedValueOnce({
      organizationId: testId('org'),
      sourceActionId: 'publish-card-distinct',
      threadId: testId('thread'),
      toolName: AgentToolName.CREATE_POST,
    });
    await service.executeTool(
      AgentToolName.CREATE_POST,
      { ...parameters, sourceActionId: 'publish-card-distinct' },
      context,
    );

    const firstKey = postGroupsService.create.mock.calls[0]?.[3];
    const secondKey = postGroupsService.create.mock.calls[1]?.[3];
    const distinctKey = postGroupsService.create.mock.calls[2]?.[3];
    expect(firstKey).toMatch(/^agent-publish:[a-f0-9]{64}$/);
    expect(secondKey).toBe(firstKey);
    expect(distinctKey).not.toBe(firstKey);
  });

  it('fails closed when a confirmed caller omits sourceActionId', async () => {
    const {
      credentialsService,
      ingredientsService,
      postGroupsService,
      service,
    } = createService();
    ingredientsService.findOne.mockResolvedValue({
      brandId: testId('brandvideo'),
      category: 'image',
      id: testId('ingredientvideo'),
    });
    credentialsService.find.mockResolvedValue([
      {
        id: testId('credentiallinkedin2'),
        platform: 'linkedin',
      },
    ]);
    const parameters = {
      caption: 'Deterministic fallback',
      contentId: testId('ingredientvideo'),
      platforms: ['linkedin'],
    };
    const context: ToolExecutionContext = {
      ...scopedContext(testId('brandvideo')),
      confirmationOrigin: 'thread-ui-action',
    };

    const result = await service.executeTool(
      AgentToolName.CREATE_POST,
      parameters,
      context,
    );

    expect(result).toEqual(
      expect.objectContaining({
        error:
          'sourceActionId is required to publish confirmed content safely.',
        success: false,
      }),
    );
    expect(postGroupsService.create).not.toHaveBeenCalled();
    expect(postGroupsService.publishNow).not.toHaveBeenCalled();
  });

  it('fails before creating a release when any requested platform is disconnected', async () => {
    const {
      credentialsService,
      ingredientsService,
      postGroupsService,
      publishCacheService,
      service,
    } = createService();
    ingredientsService.findOne.mockResolvedValue({
      brandId: testId('brandvideo'),
      category: 'image',
      id: testId('ingredientvideo'),
    });
    credentialsService.find.mockResolvedValue([
      {
        id: testId('credentiallinkedin2'),
        platform: 'linkedin',
      },
    ]);

    publishCacheService.get.mockResolvedValueOnce({
      organizationId: testId('org'),
      sourceActionId: 'publish-card-missing',
      threadId: testId('thread'),
      toolName: AgentToolName.CREATE_POST,
    });

    const result = await service.executeTool(
      AgentToolName.CREATE_POST,
      {
        contentId: testId('ingredientvideo'),
        platforms: ['linkedin', 'instagram'],
        sourceActionId: 'publish-card-missing',
      },
      {
        ...scopedContext(testId('brandvideo')),
        confirmationOrigin: 'thread-ui-action',
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          missingPlatforms: ['instagram'],
        }),
        error: 'Missing connected accounts for: instagram.',
        success: false,
      }),
    );
    expect(postGroupsService.create).not.toHaveBeenCalled();
    expect(postGroupsService.publishNow).not.toHaveBeenCalled();
  });

  it('rejects stale publishing scope before creating post records', async () => {
    const { agentScopeContextService, postsService, service } = createService();
    agentScopeContextService.assertConsequentialBoundary.mockRejectedValue(
      new Error('Agent context is stale.'),
    );

    const result = await service.executeTool(
      AgentToolName.CREATE_POST,
      {
        caption: 'Must not publish',
        contentId: testId('ingredientvideo'),
        platforms: ['linkedin'],
      },
      {
        ...scopedContext(testId('brandvideo')),
        confirmationOrigin: 'thread-ui-action',
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        error: 'Agent context is stale.',
        success: false,
      }),
    );
    expect(postsService.create).not.toHaveBeenCalled();
  });

  it('returns a post analytics snapshot for the latest related published post', async () => {
    const { ingredientsService, postAnalyticsService, postsService, service } =
      createService();

    ingredientsService.findOne.mockResolvedValue({
      id: testId('ingredientanalytics'),
      brandId: testId('brandanalytics'),
      category: 'image',
    });
    postsService.findAll.mockResolvedValue({
      docs: [{ id: testId('postanalytics') }],
    });

    const result = await service.executeTool(
      AgentToolName.GET_ANALYTICS,
      {
        contentId: testId('ingredientanalytics'),
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.creditsUsed).toBe(0);
    expect(postAnalyticsService.getPostAnalyticsSummary).toHaveBeenCalledWith(
      testId('postanalytics'),
    );
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        title: 'Content analytics snapshot',
        type: 'analytics_snapshot_card',
      }),
    ]);
  });

  it('rejects direct post analytics outside the validated brand scope', async () => {
    const {
      agentScopeContextService,
      postAnalyticsService,
      postsService,
      service,
    } = createService();
    postsService.findOne.mockResolvedValue({
      brandId: testId('postanalytics'),
      id: testId('postrejected'),
    });
    agentScopeContextService.assertResourceBrand.mockImplementation(
      (_scope: unknown, brandId: string | undefined) => {
        if (brandId !== testId('brandanalytics')) {
          throw new Error(
            'Selected post is outside the validated brand scope.',
          );
        }
      },
    );

    const context = scopedContext(testId('brandanalytics'));
    const result = await service.executeTool(
      AgentToolName.GET_ANALYTICS,
      { postId: testId('postrejected') },
      context,
    );

    expect(result).toEqual(
      expect.objectContaining({
        error: 'Selected post is outside the validated brand scope.',
        success: false,
      }),
    );
    expect(agentScopeContextService.assertResourceBrand).toHaveBeenCalledWith(
      context.validatedScope,
      testId('postanalytics'),
      'selected post',
    );
    expect(postAnalyticsService.getPostAnalyticsSummary).not.toHaveBeenCalled();
  });

  it('returns post analytics for an article contentId once it has a published post', async () => {
    const {
      articleAnalyticsService,
      articlesService,
      postAnalyticsService,
      postsService,
      service,
    } = createService();

    // Not an ingredient — the id names an article, which lives in its own
    // collection and reaches a post through the `entityArticleId` scalar FK.
    articlesService.findOne.mockResolvedValue({
      id: testId('article1'),
      brandId: testId('brandarticle1'),
    });
    articleAnalyticsService.getArticleAnalyticsSummary.mockResolvedValue({
      avgEngagementRate: 1.2,
      totalComments: 2,
      totalLikes: 5,
      totalViews: 40,
    });
    postsService.findAll.mockResolvedValue({
      docs: [{ id: testId('postarticle1') }],
    });

    const result = await service.executeTool(
      AgentToolName.GET_ANALYTICS,
      { contentId: testId('article1') },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.creditsUsed).toBe(0);
    expect(postsService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityArticleId: testId('article1'),
          isDeleted: false,
          organizationId: testId('org'),
        }),
      }),
      { limit: 1, page: 1 },
    );
    expect(postAnalyticsService.getPostAnalyticsSummary).toHaveBeenCalledWith(
      testId('postarticle1'),
    );
    expect(result.data).toMatchObject({
      articleId: testId('article1'),
      postId: testId('postarticle1'),
    });
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        title: 'Article analytics snapshot',
        type: 'analytics_snapshot_card',
      }),
    ]);
  });

  it('returns on-site article analytics when the article has no published post', async () => {
    const {
      articleAnalyticsService,
      articlesService,
      postAnalyticsService,
      postsService,
      service,
    } = createService();

    articlesService.findOne.mockResolvedValue({
      id: testId('article2'),
      brandId: testId('brandarticle2'),
    });
    articleAnalyticsService.getArticleAnalyticsSummary.mockResolvedValue({
      avgEngagementRate: 3.5,
      totalComments: 4,
      totalLikes: 11,
      totalViews: 320,
    });
    postsService.findAll.mockResolvedValue({ docs: [] });

    const result = await service.executeTool(
      AgentToolName.GET_ANALYTICS,
      { contentId: testId('article2') },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(postAnalyticsService.getPostAnalyticsSummary).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      articleId: testId('article2'),
      articleSummary: { totalViews: 320 },
    });
    expect(result.nextActions?.[0]).toEqual(
      expect.objectContaining({
        metrics: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ label: 'Views', value: 320 }),
          ]),
        }),
        title: 'Article analytics snapshot',
        type: 'analytics_snapshot_card',
      }),
    );
  });

  it('returns a no-analytics-yet message for an article with neither source', async () => {
    const { articlesService, postsService, service } = createService();

    articlesService.findOne.mockResolvedValue({
      id: testId('article3'),
      brandId: testId('brandarticle3'),
    });
    postsService.findAll.mockResolvedValue({ docs: [] });

    const result = await service.executeTool(
      AgentToolName.GET_ANALYTICS,
      { contentId: testId('article3') },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      articleId: testId('article3'),
      message:
        'This article has no analytics yet. Publish it to start collecting metrics.',
    });
  });

  it('rejects article analytics outside the validated brand scope', async () => {
    const {
      agentScopeContextService,
      articleAnalyticsService,
      articlesService,
      postAnalyticsService,
      service,
    } = createService();

    articlesService.findOne.mockResolvedValue({
      id: testId('article4'),
      brandId: testId('brandarticle4'),
    });
    agentScopeContextService.assertResourceBrand.mockImplementation(
      (_scope: unknown, brandId: string | undefined) => {
        if (brandId !== testId('brandanalytics')) {
          throw new Error(
            'Selected content is outside the validated brand scope.',
          );
        }
      },
    );

    const context = scopedContext(testId('brandanalytics'));
    const result = await service.executeTool(
      AgentToolName.GET_ANALYTICS,
      { contentId: testId('article4') },
      context,
    );

    expect(result).toEqual(
      expect.objectContaining({
        error: 'Selected content is outside the validated brand scope.',
        success: false,
      }),
    );
    expect(agentScopeContextService.assertResourceBrand).toHaveBeenCalledWith(
      context.validatedScope,
      testId('brandarticle4'),
      'selected content',
    );
    expect(
      articleAnalyticsService.getArticleAnalyticsSummary,
    ).not.toHaveBeenCalled();
    expect(postAnalyticsService.getPostAnalyticsSummary).not.toHaveBeenCalled();
  });

  it('returns a no-analytics-yet response when content has no published post', async () => {
    const { credentialsService, ingredientsService, postsService, service } =
      createService();

    ingredientsService.findOne.mockResolvedValue({
      id: testId('ingredientnoanalytics'),
      brandId: testId('brandcontent'),
      category: 'image',
    });
    credentialsService.find.mockResolvedValue([
      {
        id: testId('credentialinstagram'),
        platform: 'instagram',
      },
    ]);
    postsService.findAll.mockResolvedValue({ docs: [] });

    const result = await service.executeTool(
      AgentToolName.GET_ANALYTICS,
      {
        contentId: testId('ingredientnoanalytics'),
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.creditsUsed).toBe(0);
    expect(result.data).toMatchObject({
      contentId: testId('ingredientnoanalytics'),
      message:
        'This content does not have a published post yet, so analytics are not available.',
    });
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        contentId: testId('ingredientnoanalytics'),
        type: 'publish_post_card',
      }),
    ]);
  });

  it('keeps organization analytics summary responses normalized for chat cards', async () => {
    const { analyticsService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.GET_ANALYTICS,
      { period: '30d' },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.creditsUsed).toBe(0);
    expect(analyticsService.getOverview).toHaveBeenCalled();
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        metrics: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ label: 'Views', value: 4200 }),
            expect.objectContaining({ label: 'Posts', value: 12 }),
          ]),
        }),
        type: 'analytics_snapshot_card',
      }),
    ]);
  });
  it('should capture memory and report routed destinations', async () => {
    const { agentMemoryCaptureService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.CAPTURE_MEMORY,
      {
        brandId: testId('goal'),
        content: 'Use short, curiosity-driven newsletter openings.',
        contentType: 'newsletter',
        kind: 'winner',
        saveToContextMemory: true,
        scope: 'brand',
        summary: 'Short curiosity-driven newsletter openings',
        tags: ['newsletter', 'hook'],
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(agentMemoryCaptureService.capture).toHaveBeenCalled();
    expect(result.data).toEqual(
      expect.objectContaining({
        contentType: 'newsletter',
        destinations: expect.arrayContaining([
          'agent memory',
          'content memory',
        ]),
        kind: 'preference',
        scope: 'user',
      }),
    );
  });

  it('proposes brand creation without mutating, including when confirmed is spoofed', async () => {
    const { brandsService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.CREATE_BRAND,
      {
        confirmed: true,
        description: 'Creator focused fitness content',
        handle: '@fitcreator',
        name: 'Fit Creator',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.nextActions?.[0]).toMatchObject({
      ctas: [
        expect.objectContaining({
          action: 'confirm_create_brand',
          label: 'Confirm create',
        }),
      ],
      data: expect.objectContaining({
        operation: 'create',
        proposal: expect.objectContaining({
          label: 'Fit Creator',
          slug: 'fitcreator',
        }),
      }),
      type: 'brand_identity_confirmation_card',
    });
    expect(brandsService.findOne).not.toHaveBeenCalled();
    expect(brandsService.create).not.toHaveBeenCalled();
  });

  it('creates a confirmed brand with canonical execution identity', async () => {
    const { brandsService, service } = createService();
    brandsService.findOne.mockResolvedValue(null);

    const result = await service.executeTool(
      AgentToolName.CREATE_BRAND,
      {
        description: 'Creator focused fitness content',
        label: 'Fit Creator',
        organizationId: 'foreign-org',
        slug: 'fit-creator',
        sourceActionId: 'brand-identity-66666666-6666-4666-8666-666666666666',
        userId: 'foreign-user',
      },
      {
        confirmationOrigin: 'thread-ui-action',
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(brandsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConfig: {
          brandIdentityConfirmation: {
            createSourceActionId:
              'brand-identity-66666666-6666-4666-8666-666666666666',
            requestedSlug: 'fit-creator',
            source: 'agent-thread-ui-action',
          },
        },
        organizationId: testId('org'),
        slug: 'fit-creator',
        userId: testId('user'),
      }),
    );
    expect(brandsService.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        handle: expect.anything(),
        organization: expect.anything(),
      }),
    );
  });

  it('rejects a trusted confirmation origin without persisted source evidence', async () => {
    const { brandsService, service } = createService();

    const createResult = await service.executeTool(
      AgentToolName.CREATE_BRAND,
      { label: 'Missing Evidence' },
      {
        confirmationOrigin: 'thread-ui-action',
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );
    const renameResult = await service.executeTool(
      AgentToolName.RENAME_BRAND,
      { label: 'Missing Evidence' },
      {
        ...scopedContext('brand-1'),
        confirmationOrigin: 'thread-ui-action',
      },
    );

    expect(createResult).toMatchObject({
      error:
        'Confirmed brand identity changes require valid source action evidence.',
      success: false,
    });
    expect(renameResult).toMatchObject({
      error:
        'Confirmed brand identity changes require valid source action evidence.',
      success: false,
    });
    expect(brandsService.findOne).not.toHaveBeenCalled();
    expect(brandsService.create).not.toHaveBeenCalled();
    expect(brandsService.updateIdentityForOrganization).not.toHaveBeenCalled();
  });

  it('recovers a confirmed create retry only from an exact scoped identity match', async () => {
    const { brandsService, service } = createService();
    brandsService.findOne.mockResolvedValue({
      agentConfig: {
        brandIdentityConfirmation: {
          createSourceActionId:
            'brand-identity-77777777-7777-4777-8777-777777777777',
          requestedSlug: 'recovered-brand',
        },
      },
      description: 'Confirmed description',
      id: 'brand-recovered',
      label: 'Recovered Brand',
      organizationId: testId('org'),
      slug: 'recovered-brand',
      userId: testId('user'),
    });

    const result = await service.executeTool(
      AgentToolName.CREATE_BRAND,
      {
        description: 'Confirmed description',
        label: 'Recovered Brand',
        slug: 'recovered-brand',
        sourceActionId: 'brand-identity-77777777-7777-4777-8777-777777777777',
      },
      {
        ...scopedContext('brand-recovered'),
        confirmationOrigin: 'thread-ui-action',
      },
    );

    expect(result).toMatchObject({
      data: {
        brandId: 'brand-recovered',
        created: false,
        recovered: true,
      },
      success: true,
    });
    expect(brandsService.create).not.toHaveBeenCalled();
  });

  it('recovers a suffixed create after a post-create failure without duplicating the brand', async () => {
    const { brandsService, service, videosService } = createService();
    const sourceActionId =
      'brand-identity-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const createdBrand = {
      agentConfig: {
        brandIdentityConfirmation: {
          createSourceActionId: sourceActionId,
          requestedSlug: 'collision-brand',
        },
      },
      description: 'Confirmed description',
      id: 'brand-collision',
      label: 'Collision Brand',
      organizationId: testId('org'),
      slug: 'collision-brand-2',
      userId: testId('user'),
    };
    let created = false;
    brandsService.findCreateByIdentityConfirmationSource.mockImplementation(
      async () => (created ? createdBrand : null),
    );
    brandsService.findOne.mockResolvedValue(null);
    brandsService.create.mockImplementation(async () => {
      created = true;
      return createdBrand;
    });
    vi.spyOn(videosService, 'findOne')
      .mockRejectedValueOnce(new Error('post-create dependency failed'))
      .mockResolvedValue(null);
    const parameters = {
      description: 'Confirmed description',
      label: 'Collision Brand',
      slug: 'collision-brand',
      sourceActionId,
    };
    const context = {
      confirmationOrigin: 'thread-ui-action' as const,
      organizationId: testId('org'),
      userId: testId('user'),
    };

    const first = await service.executeTool(
      AgentToolName.CREATE_BRAND,
      parameters,
      context,
    );
    const retry = await service.executeTool(
      AgentToolName.CREATE_BRAND,
      parameters,
      context,
    );

    expect(first).toMatchObject({
      error: 'post-create dependency failed',
      success: false,
    });
    expect(retry).toMatchObject({
      data: {
        brandId: 'brand-collision',
        created: false,
        recovered: true,
        slug: 'collision-brand-2',
      },
      success: true,
    });
    expect(brandsService.create).toHaveBeenCalledTimes(1);
  });

  it('rejects rename when the active thread brand is outside the organization', async () => {
    const { brandsService, service } = createService();
    brandsService.findOne.mockResolvedValue(null);

    const result = await service.executeTool(
      AgentToolName.RENAME_BRAND,
      {
        label: 'Renamed Brand',
        slug: 'renamed-brand',
        sourceActionId: 'brand-identity-88888888-8888-4888-8888-888888888888',
      },
      {
        ...scopedContext('foreign-brand'),
        confirmationOrigin: 'thread-ui-action',
      },
    );

    expect(result.success).toBe(false);
    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: 'foreign-brand',
      organizationId: testId('org'),
    });
    expect(brandsService.updateIdentityForOrganization).not.toHaveBeenCalled();
  });

  it('renames the confirmed active brand within the validated organization scope', async () => {
    const { brandsService, service } = createService();
    brandsService.findOne.mockResolvedValue({
      description: 'Existing description',
      id: 'brand-1',
      label: 'Old Brand',
      slug: 'old-brand',
    });
    brandsService.updateIdentityForOrganization.mockResolvedValue({
      id: 'brand-1',
    });

    const result = await service.executeTool(
      AgentToolName.RENAME_BRAND,
      {
        label: 'Renamed Brand',
        slug: 'renamed-brand',
        sourceActionId: 'brand-identity-99999999-9999-4999-8999-999999999999',
      },
      {
        ...scopedContext('brand-1'),
        confirmationOrigin: 'thread-ui-action',
      },
    );

    expect(result).toMatchObject({
      data: {
        brandId: 'brand-1',
        label: 'Renamed Brand',
        renamed: true,
        slug: 'renamed-brand',
      },
      success: true,
    });
    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      organizationId: testId('org'),
    });
    expect(brandsService.updateIdentityForOrganization).toHaveBeenCalledWith(
      'brand-1',
      testId('org'),
      {
        description: 'Existing description',
        label: 'Renamed Brand',
        slug: 'renamed-brand',
      },
    );
  });

  it('should return onboarding status for required setup milestones', async () => {
    const { postsService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.CHECK_ONBOARDING_STATUS,
      {},
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        completionPercent: expect.any(Number),
        isComplete: expect.any(Boolean),
        missions: expect.any(Array),
        providerReadiness: expect.objectContaining({
          configuredProviderCount: expect.any(Number),
          configuredProviders: expect.any(Array),
          isReady: expect.any(Boolean),
        }),
      }),
    );
    expect(result.nextActions?.[0].type).toBe('onboarding_checklist_card');
    expect(postsService.findOne).toHaveBeenCalledWith(
      {
        organizationId: testId('org'),
        targetExecutionState: TargetExecutionState.PUBLISHED,
      },
      [],
    );
  });

  it('should draft a brand voice profile card for the selected brand', async () => {
    const { brandsService, service } = createService();

    brandsService.findOne.mockResolvedValue({
      agentConfig: { strategy: { platforms: ['linkedin'] } },
      id: 'brand-voice-1',
      label: 'Genfeed',
    });

    const result = await service.executeTool(
      AgentToolName.DRAFT_BRAND_VOICE_PROFILE,
      {
        examplesToAvoid: ['generic guru tone'],
        examplesToEmulate: ['April Dunford'],
        offering: 'AI workflow software for operators',
        targetAudience: 'startup operators',
        url: 'https://genfeed.ai',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(brandsService.generateBrandVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-voice-1',
        examplesToAvoid: ['generic guru tone'],
        examplesToEmulate: ['April Dunford'],
        offering: 'AI workflow software for operators',
        targetAudience: 'startup operators',
        url: 'https://genfeed.ai',
      }),
      testId('org'),
    );
    expect(result.nextActions?.[0]).toMatchObject({
      brandId: 'brand-voice-1',
      ctas: [
        expect.objectContaining({
          action: 'confirm_save_brand_voice_profile',
          label: 'Approve and save',
        }),
      ],
      title: 'Brand Voice Draft',
      type: 'brand_voice_profile_card',
    });
    expect(result.nextActions?.[0].data).toEqual(
      expect.objectContaining({
        voiceProfile: expect.objectContaining({
          messagingPillars: ['clarity', 'speed', 'proof'],
          tone: 'confident',
        }),
      }),
    );
  });

  it('should give consecutive same-brand voice drafts distinct action identities', async () => {
    const { brandsService, service } = createService();

    brandsService.findOne.mockResolvedValue({
      agentConfig: { strategy: { platforms: ['linkedin'] } },
      id: 'brand-voice-1',
      label: 'Genfeed',
    });

    const first = await service.executeTool(
      AgentToolName.DRAFT_BRAND_VOICE_PROFILE,
      {},
      { organizationId: testId('org'), userId: testId('user') },
    );
    const second = await service.executeTool(
      AgentToolName.DRAFT_BRAND_VOICE_PROFILE,
      {},
      { organizationId: testId('org'), userId: testId('user') },
    );
    const firstAction = first.nextActions?.[0];
    const secondAction = second.nextActions?.[0];

    expect(firstAction?.id).toMatch(/^brand-voice-profile-/);
    expect(secondAction?.id).toMatch(/^brand-voice-profile-/);
    expect(secondAction?.id).not.toBe(firstAction?.id);
    expect(firstAction?.ctas?.[0]?.payload).toEqual(
      expect.objectContaining({ sourceActionId: firstAction?.id }),
    );
    expect(secondAction?.ctas?.[0]?.payload).toEqual(
      expect.objectContaining({ sourceActionId: secondAction?.id }),
    );
  });

  it('should persist an approved brand voice profile into brand agent config', async () => {
    const { brandsService, service } = createService();

    brandsService.findOne.mockResolvedValue({
      agentConfig: { strategy: { platforms: ['linkedin'] } },
      id: 'brand-voice-1',
      label: 'Genfeed',
    });

    const result = await service.executeTool(
      AgentToolName.SAVE_BRAND_VOICE_PROFILE,
      {
        brandId: 'brand-voice-1',
        voiceProfile: {
          approvedHooks: ['Say the quiet part out loud'],
          audience: ['founders', 'operators'],
          bannedPhrases: ['game-changing AI'],
          canonicalSource: 'founder',
          doNotSoundLike: ['buzzword-heavy'],
          exemplarTexts: ['We ship systems, not vibes'],
          hashtags: ['#genfeed'],
          messagingPillars: ['clarity', 'systems'],
          prompting: {
            conversationStarters: [
              {
                id: 'brand-create-clarity',
                intent: 'create',
                label: 'Create clarity',
                prompt: 'Create three posts about clarity.',
                topic: 'clarity',
              },
            ],
            seeds: [
              {
                angle: 'Practical guide',
                audience: 'founders',
                preferredFormats: ['post'],
                topic: 'clarity',
              },
            ],
          },
          sampleOutput: 'Clear systems create compounding output.',
          strategy: {
            goals: ['Increase qualified leads'],
            topics: ['clarity', 'systems'],
          },
          style: 'direct',
          taglines: ['Ship with signal'],
          tone: 'confident',
          values: ['clarity', 'proof'],
          writingRules: ['Lead with proof'],
        },
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(brandsService.updateAgentConfig).toHaveBeenCalledWith(
      'brand-voice-1',
      testId('org'),
      {
        prompting: {
          conversationStarters: [
            {
              id: 'brand-create-clarity',
              intent: 'create',
              label: 'Create clarity',
              prompt: 'Create three posts about clarity.',
              topic: 'clarity',
            },
          ],
          seeds: [
            {
              angle: 'Practical guide',
              audience: 'founders',
              preferredFormats: ['post'],
              topic: 'clarity',
            },
          ],
        },
        strategy: {
          goals: ['Increase qualified leads'],
          platforms: ['linkedin'],
          topics: ['clarity', 'systems'],
        },
        voice: {
          approvedHooks: ['Say the quiet part out loud'],
          audience: ['founders', 'operators'],
          bannedPhrases: ['game-changing AI'],
          canonicalSource: 'founder',
          doNotSoundLike: ['buzzword-heavy'],
          exemplarTexts: ['We ship systems, not vibes'],
          hashtags: ['#genfeed'],
          messagingPillars: ['clarity', 'systems'],
          sampleOutput: 'Clear systems create compounding output.',
          style: 'direct',
          taglines: ['Ship with signal'],
          tone: 'confident',
          values: ['clarity', 'proof'],
          writingRules: ['Lead with proof'],
        },
      },
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        brandId: 'brand-voice-1',
        saved: true,
      }),
    );
  });

  it('should mark publish_first_post as completed in onboarding status when a public post exists', async () => {
    const {
      creditsUtilsService,
      organizationSettingsService,
      postsService,
      service,
    } = createService();

    postsService.findOne.mockResolvedValue({
      id: 'post-1',
      targetExecutionState: TargetExecutionState.PUBLISHED,
    });

    const result = await service.executeTool(
      AgentToolName.CHECK_ONBOARDING_STATUS,
      {},
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.data?.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'publish_first_post',
          isCompleted: true,
          rewardClaimed: false,
          rewardCredits: 0,
        }),
      ]),
    );
    expect(result.nextActions?.[0]).toEqual(
      expect.objectContaining({
        checklist: expect.arrayContaining([
          expect.objectContaining({
            id: 'publish_first_post',
            isClaimed: false,
            isCompleted: true,
          }),
        ]),
        type: 'onboarding_checklist_card',
      }),
    );
    expect(organizationSettingsService.patch).toHaveBeenCalled();
    expect(
      creditsUtilsService.addOrganizationCreditsWithExpiration,
    ).not.toHaveBeenCalled();
  });

  it('should return ingredient_picker_card with empty library', async () => {
    const { service } = createService();

    const result = await service.executeTool(
      AgentToolName.SELECT_INGREDIENT,
      {},
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        count: 0,
        message: 'No media assets found in your library.',
      }),
    );
  });

  it('should return ingredient_picker_card with assets when library has content', async () => {
    const { imagesService, service } = createService();

    imagesService.findAllByOrganization.mockResolvedValue([
      {
        category: IngredientCategory.IMAGE,
        cdnUrl: 'https://cdn.genfeed.ai/images/test.jpg',
        id: testId('content'),
        metadata: { label: 'Test Image' },
      },
      {
        category: IngredientCategory.VIDEO,
        cdnUrl: 'https://cdn.genfeed.ai/videos/test.mp4',
        id: testId('videoasset'),
        metadata: null,
      },
    ]);

    const result = await service.executeTool(
      AgentToolName.SELECT_INGREDIENT,
      { mediaType: 'all' },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.data?.count).toBe(2);
    expect(result.nextActions).toHaveLength(1);
    expect(result.nextActions?.[0].type).toBe('ingredient_picker_card');
    expect(result.nextActions?.[0].ingredients).toHaveLength(2);
    expect(result.nextActions?.[0].ingredients?.[0]).toEqual(
      expect.objectContaining({
        id: testId('content'),
        title: 'Test Image',
        type: 'image',
        url: 'https://cdn.genfeed.ai/images/test.jpg',
      }),
    );
    expect(result.nextActions?.[0].ingredients?.[1]).toEqual(
      expect.objectContaining({
        id: testId('videoasset'),
        type: 'video',
        url: 'https://cdn.genfeed.ai/videos/test.mp4',
      }),
    );
  });

  it('should filter by mediaType image only', async () => {
    const { imagesService, service } = createService();

    imagesService.findAllByOrganization.mockResolvedValue([
      {
        id: testId('imageasset'),
        category: IngredientCategory.IMAGE,
        cdnUrl: 'https://cdn.genfeed.ai/images/img.jpg',
        metadata: null,
      },
    ]);

    const result = await service.executeTool(
      AgentToolName.SELECT_INGREDIENT,
      { mediaType: 'image' },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.nextActions?.[0].ingredients?.[0].type).toBe('image');
    expect(imagesService.findAllByOrganization).toHaveBeenCalledWith(
      testId('org'),
      expect.objectContaining({
        category: expect.objectContaining({ in: [IngredientCategory.IMAGE] }),
      }),
      { createdAt: -1 },
      expect.any(Array),
    );
  });

  it('should complete onboarding and sync claims', async () => {
    const { organizationsService, service, usersService } = createService();

    const result = await service.executeTool(
      AgentToolName.COMPLETE_ONBOARDING,
      {},
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(organizationsService.patch).toHaveBeenCalled();
    expect(usersService.patch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        isOnboardingCompleted: true,
      }),
    );
  });

  it('should return the current selected brand', async () => {
    const { brandsService, service } = createService();

    brandsService.findOne.mockResolvedValue({
      description: 'Brand description',
      handle: 'genfeed',
      id: testId('currentbrand'),
      isActive: true,
      label: 'Genfeed',
      text: 'Publish content. Now.',
    });

    const result = await service.executeTool(
      AgentToolName.GET_CURRENT_BRAND,
      {},
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        currentBrand: expect.objectContaining({
          description: 'Brand description',
          id: testId('currentbrand'),
          isActive: true,
          label: 'Genfeed',
          name: 'Genfeed',
          slug: '',
          text: 'Publish content. Now.',
        }),
      }),
    );
    expect(brandsService.findOne).toHaveBeenCalledWith({
      isDeleted: false,
      isSelected: true,
      organizationId: testId('org'),
      userId: testId('user'),
    });
  });

  it('should prefer explicit context brandId over isSelected', async () => {
    const { brandsService, service } = createService();

    brandsService.findOne.mockResolvedValue({
      description: 'Scoped brand',
      handle: 'scoped',
      id: testId('entitybb'),
      isActive: true,
      label: 'Scoped',
      text: 'Scoped brand',
    });

    const result = await service.executeTool(
      AgentToolName.GET_CURRENT_BRAND,
      {},
      {
        brandId: testId('entitybb'),
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: testId('entitybb'),
      isDeleted: false,
      organizationId: testId('org'),
    });
    expect(brandsService.findOne).not.toHaveBeenCalledWith(
      expect.objectContaining({ isSelected: true }),
    );
  });

  it('should return an error when no selected brand exists', async () => {
    const { brandsService, service } = createService();

    brandsService.findOne.mockResolvedValue(null);

    const result = await service.executeTool(
      AgentToolName.GET_CURRENT_BRAND,
      {},
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No brand is currently selected');
  });

  it('should use the selected brand when batch generation omits brandId', async () => {
    const { batchGenerationService, brandsService, service } = createService();

    brandsService.findOne.mockResolvedValue({
      description: 'Brand description',
      handle: 'genfeed',
      id: testId('currentbrand'),
      isActive: true,
      isSelected: true,
      label: 'Genfeed',
      text: 'Publish content. Now.',
    });

    const result = await service.executeTool(
      AgentToolName.GENERATE_CONTENT_BATCH,
      {
        count: 20,
        platforms: ['instagram', 'twitter', 'linkedin'],
        topics: ['AI content creation'],
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(batchGenerationService.createBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: testId('currentbrand'),
        count: 20,
        platforms: ['instagram', 'twitter', 'linkedin'],
        topics: ['AI content creation'],
      }),
      testId('user'),
      testId('org'),
    );
    expect(brandsService.findOne).toHaveBeenCalledWith({
      isDeleted: false,
      isSelected: true,
      organizationId: testId('org'),
      userId: testId('user'),
    });
  });

  it('hands an async batch to the workflow queue with its live thread identity', async () => {
    const {
      batchGenerationService,
      batchGenerationWorkflowService,
      brandsService,
      service,
    } = createService();

    brandsService.findOne.mockResolvedValue({
      description: 'Brand description',
      handle: 'genfeed',
      id: testId('currentbrand'),
      isActive: true,
      isSelected: true,
      label: 'Genfeed',
      text: 'Publish content. Now.',
    });

    const result = await service.executeTool(
      AgentToolName.GENERATE_CONTENT_BATCH,
      {
        count: 2,
        platforms: ['instagram'],
        topics: ['launch day'],
      },
      {
        organizationId: testId('org'),
        runId: 'run-1',
        threadId: 'thread-1',
        userId: testId('user'),
        validatedScope: {
          brandId: 'brand-1',
          contextVersion: 1,
          isLegacyFallback: false,
          isVersionExplicit: true,
          organizationId: testId('org'),
          source: 'explicit',
          threadId: 'thread-1',
          userId: testId('user'),
        },
      },
    );

    expect(result.success).toBe(true);
    // Generation runs in the batch workflow now — the tool only reserves credits
    // and hands over the identity the workflow streams progress back through.
    expect(batchGenerationWorkflowService.queueBatch).toHaveBeenCalledWith({
      batchId: testId('batch'),
      organizationId: testId('org'),
      runId: 'run-1',
      threadId: 'thread-1',
      userId: testId('user'),
    });
    expect(batchGenerationService.processBatch).not.toHaveBeenCalled();
  });

  it('should return clip_workflow_run_card from prepare_clip_workflow_run', async () => {
    const { service, workflowsService } = createService();

    workflowsService.findAll.mockResolvedValue({
      docs: [
        {
          description: 'Main clip workflow',
          id: testId('clipworkflow'),
          name: 'Clip Workflow',
          status: 'active',
        },
      ],
    });

    const result = await service.executeTool(
      AgentToolName.PREPARE_CLIP_WORKFLOW_RUN,
      {
        durationSeconds: 30,
        mergeGeneratedVideos: true,
        prompt: 'Generate a 30-second landscape clip for X',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.nextActions).toHaveLength(1);
    expect(result.nextActions?.[0].type).toBe('clip_workflow_run_card');
    expect(result.nextActions?.[0].workflowId).toBe(testId('clipworkflow'));
    expect(result.nextActions?.[0].clipRun).toEqual(
      expect.objectContaining({
        durationSeconds: 30,
        format: 'landscape',
        mergeGeneratedVideos: true,
      }),
    );
  });

  it('should resolve brand HeyGen defaults for prepare_clip_workflow_run', async () => {
    const { brandsService, service, workflowsService } = createService();

    brandsService.findOne.mockResolvedValue({
      id: testId('currentbrand'),
      agentConfig: {
        heygenAvatarId: 'brand-avatar-1',
        heygenVoiceId: 'brand-voice-1',
      },
    });
    workflowsService.findAll.mockResolvedValue({ docs: [] });

    const result = await service.executeTool(
      AgentToolName.PREPARE_CLIP_WORKFLOW_RUN,
      {
        prompt: 'Generate a defaulted clip',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    const action = result.nextActions?.[0];
    expect(action?.clipRun?.identity).toEqual(
      expect.objectContaining({
        avatarId: 'brand-avatar-1',
        isComplete: true,
        source: 'brand',
        voiceId: 'brand-voice-1',
      }),
    );
    expect(action?.clipRun?.inputValues).toEqual(
      expect.objectContaining({
        avatarId: 'brand-avatar-1',
        heygenAvatarId: 'brand-avatar-1',
        heygenVoiceId: 'brand-voice-1',
        identityStatus: 'ready',
        voiceId: 'brand-voice-1',
      }),
    );
    expect(action?.clipRunState).toEqual(
      expect.objectContaining({
        identity: expect.objectContaining({
          avatarId: 'brand-avatar-1',
          voiceId: 'brand-voice-1',
        }),
      }),
    );
  });

  it('should merge brand avatar with organization HeyGen voice fallback', async () => {
    const {
      brandsService,
      organizationSettingsService,
      service,
      workflowsService,
    } = createService();

    brandsService.findOne.mockResolvedValue({
      id: testId('currentbrand'),
      agentConfig: {
        heygenAvatarId: 'brand-avatar-2',
      },
    });
    organizationSettingsService.findOne.mockResolvedValue({
      id: 'settings-1',
      defaultVoiceRef: {
        externalVoiceId: 'org-heygen-voice-2',
        provider: 'heygen',
        source: 'catalog',
      },
    });
    workflowsService.findAll.mockResolvedValue({ docs: [] });

    const result = await service.executeTool(
      AgentToolName.PREPARE_CLIP_WORKFLOW_RUN,
      {
        prompt: 'Generate a mixed-default clip',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    const identity = result.nextActions?.[0].clipRun?.identity;
    expect(identity).toEqual(
      expect.objectContaining({
        avatarId: 'brand-avatar-2',
        isComplete: true,
        source: 'brand',
        voiceId: 'org-heygen-voice-2',
      }),
    );
  });

  it('should surface missing clip identity defaults before generation', async () => {
    const { brandsService, service, workflowsService } = createService();

    brandsService.findOne.mockResolvedValue(null);
    workflowsService.findAll.mockResolvedValue({ docs: [] });

    const result = await service.executeTool(
      AgentToolName.PREPARE_CLIP_WORKFLOW_RUN,
      {
        prompt: 'Generate a clip without defaults',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    const action = result.nextActions?.[0];
    expect(action?.description).toContain(
      'Clip identity defaults are incomplete',
    );
    expect(action?.clipRun?.identity).toEqual(
      expect.objectContaining({
        isComplete: false,
        missing: ['avatar', 'voice'],
        source: 'missing',
      }),
    );
    expect(action?.clipRun?.inputValues).toEqual(
      expect.objectContaining({
        identityStatus: 'missing_identity',
        missingIdentity: ['avatar', 'voice'],
      }),
    );
  });

  it('should sanitize colon-prefixed batch ids for list_review_queue and return a conversation card', async () => {
    const { batchGenerationService, service } = createService();
    batchGenerationService.getBatch = vi.fn().mockResolvedValue({
      id: testId('batchreview'),
      items: [
        {
          id: testId('reviewitem'),
          format: 'image',
          platform: 'instagram',
          reviewDecision: undefined,
          status: 'pending',
        },
        {
          id: testId('reviewitemapproved'),
          format: 'image',
          platform: 'linkedin',
          reviewDecision: 'approved',
          status: 'completed',
        },
      ],
      status: 'generating',
      totalCount: 2,
    });

    const result = await service.executeTool(
      AgentToolName.LIST_REVIEW_QUEUE,
      {
        batchId: `:${testId('batchreview')}`,
        limit: 25,
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      items: [
        expect.objectContaining({ reviewDecision: 'unset' }),
        expect.objectContaining({ reviewDecision: 'approved' }),
      ],
    });
    expect(batchGenerationService.getBatch).toHaveBeenCalledWith(
      testId('batchreview'),
      testId('org'),
    );
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        id: `review-queue-${testId('batchreview')}`,
        outcomeBullets: [
          'Instagram · image · unset',
          'LinkedIn · image · approved',
        ],
        primaryCta: {
          href: `/publishing/review?batch=${testId('batchreview')}&filter=ready`,
          label: 'Open reviews',
        },
        status: 'completed',
        summaryText:
          'Loaded 2 items from this batch. 1 item is ready for review right now.',
        title: 'Reviews loaded',
        type: 'completion_summary_card',
      }),
    ]);
  });

  it('falls back to the review inbox when list_review_queue gets a placeholder batchId', async () => {
    const { batchGenerationService, service } = createService();
    batchGenerationService.getBatch = vi.fn();
    batchGenerationService.getReviewInboxSummary = vi.fn().mockResolvedValue({
      approvedCount: 0,
      changesRequestedCount: 0,
      pendingCount: 1,
      readyCount: 2,
      recentItems: [
        {
          batchId: testId('batchreview'),
          createdAt: '2026-08-09T20:00:00.000Z',
          format: 'image',
          id: testId('reviewitem'),
          platform: 'instagram',
          reviewDecision: 'unset',
          status: 'completed',
          summary: 'Ready for review',
        },
      ],
      rejectedCount: 0,
    });

    const result = await service.executeTool(
      AgentToolName.LIST_REVIEW_QUEUE,
      {
        batchId: 'pending',
        limit: 10,
      },
      {
        brandId: testId('currentbrand'),
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(batchGenerationService.getBatch).not.toHaveBeenCalled();
    expect(batchGenerationService.getReviewInboxSummary).toHaveBeenCalledWith(
      testId('org'),
      testId('currentbrand'),
      10,
    );
    expect(result.data).toMatchObject({
      pendingCount: 1,
      readyCount: 2,
      scope: 'brand',
    });
    expect(result.nextActions?.[0]).toMatchObject({
      primaryCta: {
        href: '/publishing/review?filter=ready',
        label: 'Open reviews',
      },
      title: 'Reviews loaded',
      type: 'completion_summary_card',
    });
    expect(result.nextActions?.[0]?.summaryText).toContain(
      'ignored an invalid batch id',
    );
  });

  it('loads the review inbox when list_review_queue is called without a batchId', async () => {
    const { batchGenerationService, service } = createService();
    batchGenerationService.getReviewInboxSummary = vi.fn().mockResolvedValue({
      approvedCount: 0,
      changesRequestedCount: 0,
      pendingCount: 0,
      readyCount: 0,
      recentItems: [],
      rejectedCount: 0,
    });

    const result = await service.executeTool(
      AgentToolName.LIST_REVIEW_QUEUE,
      {},
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(batchGenerationService.getReviewInboxSummary).toHaveBeenCalledWith(
      testId('org'),
      undefined,
      20,
    );
    expect(result.nextActions?.[0]?.summaryText).toContain(
      'Nothing is waiting for review right now.',
    );
  });

  it('never treats a model tool call as publish approval', async () => {
    const { batchGenerationService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.BATCH_APPROVE_REJECT,
      {
        action: 'approve',
        batchId: testId('batchmodel'),
        itemIds: [testId('itemmodel')],
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('cannot grant publish approval');
    expect(batchGenerationService.approveItems).not.toHaveBeenCalled();
    expect(result.nextActions?.[0]?.primaryCta).toEqual({
      href: `/publishing/review?batch=${testId('batchmodel')}&filter=ready`,
      label: 'Review exact versions',
    });
  });

  it('should create a workflow-backed recurring automation via create_workflow', async () => {
    const { brandsService, recurringWorkflowId, service, workflowsService } =
      createService();

    brandsService.findOne.mockResolvedValue({
      id: testId('currentbrand'),
      isSelected: true,
      label: 'Genfeed',
    });

    const result = await service.executeTool(
      AgentToolName.CREATE_WORKFLOW,
      {
        contentType: 'image',
        prompt: 'Generate an alternative to this Instagram carousel every day',
        schedule: '0 17 * * *',
        timezone: 'Europe/Malta',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      testId('user'),
      testId('org'),
      expect.objectContaining({
        brandId: expect.any(String),
        isScheduleEnabled: true,
        nodes: [
          expect.objectContaining({
            data: expect.objectContaining({
              config: expect.objectContaining({ actionId: 'imageGen' }),
            }),
            type: 'genfeedAction',
          }),
        ],
        schedule: '0 17 * * *',
        timezone: 'Europe/Malta',
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        brandId: testId('currentbrand'),
        editorUrl: `/automation/workflows/${recurringWorkflowId}`,
        schedule: '0 17 * * *',
        timezone: 'Europe/Malta',
        workflowId: recurringWorkflowId,
      }),
    );
    expect(result.nextActions?.[0]).toEqual(
      expect.objectContaining({
        type: 'workflow_created_card',
        workflowId: recurringWorkflowId,
        workflowName: expect.stringContaining('automation'),
      }),
    );
  });

  it('should return a completion summary card when get_trends finds cached trends', async () => {
    const { service, trendsService } = createService();

    trendsService.getTrends.mockResolvedValue([
      {
        id: 'trend-1',
        platform: 'tiktok',
        score: 91.2,
        topic: 'Founder confession hooks',
      },
      {
        id: 'trend-2',
        platform: 'tiktok',
        score: 77.8,
        topic: 'Behind-the-scenes product build',
      },
    ]);

    const result = await service.executeTool(
      AgentToolName.GET_TRENDS,
      { platform: 'tiktok' },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(trendsService.getTrends).toHaveBeenCalledWith(
      testId('org'),
      undefined,
      'tiktok',
      { allowFetchIfMissing: false },
    );
    expect(trendsService.getTrends).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual({
      count: 2,
      trends: [
        {
          id: 'trend-1',
          platform: 'tiktok',
          score: 91.2,
          topic: 'Founder confession hooks',
        },
        {
          id: 'trend-2',
          platform: 'tiktok',
          score: 77.8,
          topic: 'Behind-the-scenes product build',
        },
      ],
    });
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^trends-tiktok-/),
        outcomeBullets: [
          'Founder confession hooks · score 91',
          'Behind-the-scenes product build · score 78',
        ],
        primaryCta: {
          href: '/analytics/trends',
          label: 'Open trends analytics',
        },
        status: 'completed',
        summaryText:
          'Loaded 2 TikTok trends from the cached corpus. Open trends analytics to review the strongest hooks and decide what to remix.',
        title: 'TikTok trends loaded',
        type: 'completion_summary_card',
      }),
    ]);
  });

  it('should keep get_trends cache-only when a live fallback would return data', async () => {
    const { service, trendsService } = createService();

    trendsService.getTrends.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'trend-3',
        platform: 'youtube',
        score: 88.4,
        topic: 'Creator teardown format',
      },
    ]);

    const result = await service.executeTool(
      AgentToolName.GET_TRENDS,
      { platform: 'youtube' },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(trendsService.getTrends).toHaveBeenCalledTimes(1);
    expect(trendsService.getTrends).toHaveBeenCalledWith(
      testId('org'),
      undefined,
      'youtube',
      { allowFetchIfMissing: false },
    );
    expect(result.data).toEqual({
      count: 0,
      trends: [],
    });
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^trends-youtube-/),
        outcomeBullets: [
          'YouTube cached corpus returned 0 trends',
          'Live fetch fallback is disabled for this tool',
        ],
        summaryText:
          'No YouTube trends are available in the cached corpus right now. Open trends analytics to confirm source coverage before retrying this task.',
        title: 'YouTube trends unavailable',
        type: 'completion_summary_card',
      }),
    ]);
  });

  it('should return an empty-state completion summary card when get_trends finds no cached trends', async () => {
    const { service, trendsService } = createService();

    trendsService.getTrends.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await service.executeTool(
      AgentToolName.GET_TRENDS,
      { platform: 'tiktok' },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(trendsService.getTrends).toHaveBeenCalledTimes(1);
    expect(trendsService.getTrends).toHaveBeenCalledWith(
      testId('org'),
      undefined,
      'tiktok',
      { allowFetchIfMissing: false },
    );
    expect(result.data).toEqual({
      count: 0,
      trends: [],
    });
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^trends-tiktok-/),
        outcomeBullets: [
          'TikTok cached corpus returned 0 trends',
          'Live fetch fallback is disabled for this tool',
        ],
        primaryCta: {
          href: '/analytics/trends',
          label: 'Open trends analytics',
        },
        status: 'completed',
        summaryText:
          'No TikTok trends are available in the cached corpus right now. Open trends analytics to confirm source coverage before retrying this task.',
        title: 'TikTok trends unavailable',
        type: 'completion_summary_card',
      }),
    ]);
  });

  it('should create a workflow directly with graph payload and workflow-created card', async () => {
    const {
      brandsService,
      organizationsService,
      recurringWorkflowId,
      service,
      workflowsService,
    } = createService();

    brandsService.findOne.mockResolvedValue({
      id: testId('currentbrand'),
      isSelected: true,
      label: 'Genfeed',
      slug: 'genfeed',
    });
    organizationsService.findOne.mockResolvedValueOnce({
      id: testId('org'),
      slug: 'genfeed-ai',
    });

    const result = await service.executeTool(
      AgentToolName.CREATE_WORKFLOW,
      {
        description: 'Create a weekly content planning workflow',
        edges: [
          {
            id: 'edge-1',
            source: 'plan',
            target: 'draft',
          },
        ],
        inputVariables: [
          {
            key: 'topic',
            label: 'Topic',
            type: 'text',
          },
        ],
        isScheduleEnabled: true,
        label: 'Weekly Content Planner',
        metadata: {
          source: 'agent-test',
        },
        nodes: [
          {
            data: {
              config: {
                actionId: 'postGen',
                parameters: { prompt: 'Plan next week of content' },
              },
              label: 'Plan Content',
            },
            id: 'plan',
            position: { x: 120, y: 120 },
            type: 'genfeedAction',
          },
          {
            data: {
              config: {
                actionId: 'postGen',
                parameters: { prompt: 'Draft the strongest option' },
              },
              label: 'Draft Content',
            },
            id: 'draft',
            position: { x: 420, y: 120 },
            type: 'genfeedAction',
          },
        ],
        schedule: ' 0 9 * * 1 ',
        timezone: ' Europe/Malta ',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      testId('user'),
      testId('org'),
      expect.objectContaining({
        brandId: expect.any(String),
        edges: [
          expect.objectContaining({
            id: 'edge-1',
            source: 'plan',
            target: 'draft',
          }),
        ],
        inputVariables: [
          expect.objectContaining({
            key: 'topic',
            label: 'Topic',
            type: 'text',
          }),
        ],
        isScheduleEnabled: true,
        label: 'Weekly Content Planner',
        metadata: expect.objectContaining({
          createdFrom: 'agent',
          source: 'agent-test',
        }),
        schedule: '0 9 * * 1',
        timezone: 'Europe/Malta',
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        editorUrl: `/genfeed-ai/genfeed/automation/workflows/${recurringWorkflowId}`,
        label: 'Weekly Content Planner',
        nextRunAt: expect.any(Date),
        schedule: '0 9 * * 1',
        timezone: 'Europe/Malta',
      }),
    );
    expect(result.data?.nextRunAt).toBeInstanceOf(Date);
    expect(result.nextActions?.[0]).toEqual(
      expect.objectContaining({
        ctas: [
          expect.objectContaining({
            href: `/genfeed-ai/genfeed/automation/workflows/${recurringWorkflowId}`,
          }),
          expect.objectContaining({
            href: '/genfeed-ai/genfeed/automation/runs',
          }),
        ],
        type: 'workflow_created_card',
        workflowId: recurringWorkflowId,
        workflowName: 'Weekly Content Planner',
      }),
    );
  });

  it('should create a workflow-backed recurring post automation', async () => {
    const { brandsService, service, workflowsService } = createService();

    brandsService.findOne.mockResolvedValue({
      id: testId('currentbrand'),
      isSelected: true,
      label: 'Genfeed',
    });

    const result = await service.executeTool(
      AgentToolName.CREATE_WORKFLOW,
      {
        contentType: 'post',
        prompt: 'Create one daily post draft about product learnings',
        schedule: '0 9 * * *',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      testId('user'),
      testId('org'),
      expect.objectContaining({
        nodes: [
          expect.objectContaining({
            data: expect.objectContaining({
              config: expect.objectContaining({
                actionId: 'postGen',
                parameters: expect.objectContaining({
                  brandId: testId('currentbrand'),
                  brandLabel: 'Genfeed',
                  prompt: 'Create one daily post draft about product learnings',
                }),
              }),
            }),
            type: 'genfeedAction',
          }),
        ],
      }),
    );
  });

  it('should create a workflow-backed recurring newsletter automation', async () => {
    const { brandsService, service, workflowsService } = createService();

    brandsService.findOne.mockResolvedValue({
      id: testId('currentbrand'),
      isSelected: true,
      label: 'Genfeed',
    });

    const result = await service.executeTool(
      AgentToolName.CREATE_WORKFLOW,
      {
        contentType: 'newsletter',
        instructions: 'Keep the issue practical and operator-focused.',
        prompt: 'Draft the next daily newsletter issue',
        schedule: '0 10 * * *',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      testId('user'),
      testId('org'),
      expect.objectContaining({
        nodes: [
          expect.objectContaining({
            data: expect.objectContaining({
              config: expect.objectContaining({
                actionId: 'newsletterGen',
                parameters: expect.objectContaining({
                  brandId: testId('currentbrand'),
                  brandLabel: 'Genfeed',
                  instructions:
                    'Keep the issue practical and operator-focused.',
                  prompt: 'Draft the next daily newsletter issue',
                }),
              }),
            }),
            type: 'genfeedAction',
          }),
        ],
      }),
    );
  });

  it('should generate a workflow from natural language before persisting it', async () => {
    const {
      brandsService,
      recurringWorkflowId,
      service,
      workflowGenerationService,
      workflowsService,
    } = createService();

    brandsService.findOne.mockResolvedValue({
      id: testId('currentbrand'),
      isSelected: true,
      label: 'Genfeed',
    });

    const result = await service.executeTool(
      AgentToolName.CREATE_WORKFLOW,
      {
        description:
          'Create a weekly LinkedIn workflow that drafts and refines one post',
        schedule: '0 9 * * 1',
        targetPlatforms: ['linkedin'],
        timezone: 'Europe/Malta',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(
      workflowGenerationService.generateWorkflowFromDescription,
    ).toHaveBeenCalledWith({
      description:
        'Create a weekly LinkedIn workflow that drafts and refines one post',
      targetPlatforms: ['linkedin'],
    });
    expect(workflowsService.createWorkflow).toHaveBeenCalledTimes(1);
    const [userId, organizationId, workflowPayload] =
      workflowsService.createWorkflow.mock.calls[0];
    expect(userId).toBe(testId('user'));
    expect(organizationId).toBe(testId('org'));
    expect(workflowPayload.brandId.toString()).toBe(testId('currentbrand'));
    expect(workflowPayload.description).toBe('Generated workflow description');
    expect(workflowPayload.edges[0]?.id).toBe('edge-1');
    expect(workflowPayload.isScheduleEnabled).toBe(true);
    expect(workflowPayload.label).toBe('Generated Workflow');
    expect(workflowPayload.metadata).toMatchObject({
      brandId: testId('currentbrand'),
      createdFrom: 'agent',
      originatingTool: AgentToolName.CREATE_WORKFLOW,
    });
    expect(workflowPayload.nodes[0]?.id).toBe('node-1');
    expect(workflowPayload.schedule).toBe('0 9 * * 1');
    expect(workflowPayload.timezone).toBe('Europe/Malta');
    expect(workflowPayload.trigger).toBe('manual');
    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        editorUrl: `/automation/workflows/${recurringWorkflowId}`,
        label: 'Generated Workflow',
      }),
    );
  });

  it('should fall back to an available brand when the selected brand is missing', async () => {
    const { brandsService, recurringWorkflowId, service, workflowsService } =
      createService();

    brandsService.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: testId('brandfallback'),
      label: 'Fallback Brand',
    });

    const result = await service.executeTool(
      AgentToolName.CREATE_WORKFLOW,
      {
        contentType: 'image',
        label: 'Fallback Brand Workflow',
        prompt: 'Create a recurring operator tip image',
        schedule: '0 8 * * 1-5',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      testId('user'),
      testId('org'),
      expect.objectContaining({
        brandId: expect.any(String),
      }),
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        brandId: testId('brandfallback'),
        editorUrl: `/automation/workflows/${recurringWorkflowId}`,
      }),
    );
  });

  it('should create a YouTube livestream bot with defaults and return a bot card', async () => {
    const {
      botsLivestreamService,
      botsService,
      brandsService,
      livestreamBotId,
      service,
    } = createService();

    brandsService.findOne.mockResolvedValue({
      id: testId('currentbrand'),
      isSelected: true,
      label: 'Genfeed',
    });

    const result = await service.executeTool(
      AgentToolName.CREATE_LIVESTREAM_BOT,
      {
        channelId: 'UC123456789',
        label: 'Launch Live Bot',
        linkUrl: 'https://genfeed.ai/show-notes',
        platform: 'youtube',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(botsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'livestream_chat',
        label: 'Launch Live Bot',
        platforms: ['youtube'],
        targets: [
          expect.objectContaining({
            channelId: 'UC123456789',
            platform: 'youtube',
          }),
        ],
      }),
    );
    expect(botsLivestreamService.getOrCreateSession).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        botId: livestreamBotId,
        openUrl: '/agents/bots/youtube-chat',
        platform: 'youtube',
      }),
    );
    expect(result.nextActions?.[0]).toMatchObject({
      botId: livestreamBotId,
      type: 'bot_created_card',
    });
  });

  it('should create a Twitch livestream bot with Twitch target fields', async () => {
    const { botsService, brandsService, service } = createService();

    brandsService.findOne.mockResolvedValue({
      id: testId('currentbrand'),
      isSelected: true,
      label: 'Genfeed',
    });

    const result = await service.executeTool(
      AgentToolName.CREATE_LIVESTREAM_BOT,
      {
        channelId: 'genfeed-live',
        label: 'Twitch Chat Bot',
        platform: 'twitch',
        senderId: 'sender-42',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(botsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        platforms: ['twitch'],
        targets: [
          expect.objectContaining({
            channelId: 'genfeed-live',
            platform: 'twitch',
            senderId: 'sender-42',
          }),
        ],
      }),
    );
    expect(result.success).toBe(true);
    expect(result.data?.openUrl).toBe('/agents/bots/twitch-chat');
  });

  it('should start a livestream bot session from chat controls', async () => {
    const { botsLivestreamService, brandsService, livestreamBotId, service } =
      createService();

    brandsService.findOne.mockResolvedValue({
      id: testId('currentbrand'),
      isSelected: true,
      label: 'Genfeed',
    });

    const result = await service.executeTool(
      AgentToolName.MANAGE_LIVESTREAM_BOT,
      {
        action: 'start_session',
        botId: livestreamBotId,
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(botsLivestreamService.startSession).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.nextActions?.[0]).toMatchObject({
      botId: livestreamBotId,
      sessionStatus: 'active',
      type: 'livestream_bot_status_card',
    });
  });

  it('should send a livestream message immediately from chat controls', async () => {
    const { botsLivestreamService, brandsService, livestreamBotId, service } =
      createService();

    brandsService.findOne.mockResolvedValue({
      id: testId('currentbrand'),
      isSelected: true,
      label: 'Genfeed',
    });

    const result = await service.executeTool(
      AgentToolName.MANAGE_LIVESTREAM_BOT,
      {
        action: 'send_now',
        botId: livestreamBotId,
        message: 'Ship it',
        platform: 'youtube',
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(botsLivestreamService.sendNow).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        message: 'Ship it',
        platform: 'youtube',
      }),
    );
    expect(result.success).toBe(true);
    expect(result.nextActions?.[0]).toMatchObject({
      botId: livestreamBotId,
      type: 'livestream_bot_status_card',
    });
  });

  it('should reject managing a livestream bot outside the current brand', async () => {
    const { botsService, brandsService, livestreamBotId, service } =
      createService();

    brandsService.findOne.mockResolvedValue({
      id: testId('brandfallback'),
      isSelected: true,
      label: 'Other Brand',
    });
    botsService.findOne.mockResolvedValue({
      id: livestreamBotId,
      brandId: testId('currentbrand'),
      category: 'livestream_chat',
      label: 'Launch Live Bot',
      livestreamSettings: { automaticPosting: true },
      organizationId: testId('org'),
      platforms: ['youtube'],
      targets: [
        {
          channelId: 'UC-live-1',
          isEnabled: true,
          platform: 'youtube',
        },
      ],
      userId: testId('user'),
    });

    const result = await service.executeTool(
      AgentToolName.MANAGE_LIVESTREAM_BOT,
      {
        action: 'start_session',
        botId: livestreamBotId,
      },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'Livestream bot not found for the current organization and brand.',
    );
  });

  it('should return an incomplete result when generate_image endpoint fails', async () => {
    const { generationGateway, loggerService, service } = createService();

    generationGateway.generateImage.mockRejectedValue(new Error('timeout'));

    const result = await service.executeTool(
      AgentToolName.GENERATE_IMAGE,
      { prompt: 'podcast host portrait' },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(false);
    expect(result.data).toEqual(
      expect.objectContaining({
        status: expect.any(String),
      }),
    );
    expect(result.nextActions?.[0]).toMatchObject({
      title: 'Image not ready',
      type: 'completion_summary_card',
    });
    expect(loggerService.warn).toHaveBeenCalled();
  });

  it('should normalize generate_image prompt from description when prompt is missing', async () => {
    const { generationGateway, service } = createService();

    generationGateway.generateImage.mockResolvedValue({
      data: {
        attributes: { cdnUrl: 'https://cdn.example.test/img-123.png' },
        id: 'img-123',
      },
    });

    const result = await service.executeTool(
      AgentToolName.GENERATE_IMAGE,
      { description: 'podcast host portrait' },
      {
        organizationId: testId('org'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        id: 'img-123',
      }),
    );
    expect(generationGateway.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          prompt: 'podcast host portrait',
          text: 'podcast host portrait',
        }),
      }),
    );
  });

  it('should read generate_image id from a root response envelope', async () => {
    const { generationGateway, service } = createService();

    generationGateway.generateImage.mockResolvedValue({
      cdnUrl: 'https://cdn.example.test/img-root-123.png',
      id: 'img-root-123',
    });

    const result = await service.executeTool(
      AgentToolName.GENERATE_IMAGE,
      { prompt: 'product photo' },
      {
        organizationId: testId('org2'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        id: 'img-root-123',
      }),
    );
    expect(result.nextActions?.[0]).toMatchObject({
      ctas: [{ href: '/library/assets', label: 'View in Library' }],
      id: 'image-gen-img-root-123',
    });
  });

  it('should prefer voice audioUrl from the response envelope', async () => {
    const { generationGateway, service } = createService();

    generationGateway.generateVoice.mockResolvedValue({
      data: {
        audioUrl: 'https://cdn.example.test/voice-123.mp3',
        id: 'voice-123',
      },
    });

    const result = await service.executeTool(
      AgentToolName.GENERATE_VOICE,
      { text: 'Read this in the brand voice', voiceId: 'voice-default' },
      {
        organizationId: testId('org2'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        id: 'voice-123',
        url: 'https://cdn.example.test/voice-123.mp3',
      }),
    );
    expect(result.nextActions?.[0]).toMatchObject({
      audio: ['https://cdn.example.test/voice-123.mp3'],
      ctas: [{ href: '/g/voice/voice-123', label: 'View in gallery' }],
    });
  });

  it('should map hashtags ai_action alias to add-hashtags DTO action', async () => {
    const { aiActionsService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.AI_ACTION,
      { action: 'hashtags', text: 'launch post copy' },
      {
        organizationId: testId('org2'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(aiActionsService.execute).toHaveBeenCalledWith(
      testId('org2'),
      expect.objectContaining({
        action: AiActionType.ADD_HASHTAGS,
        content: 'launch post copy',
      }),
    );
  });

  it('should accept canonical ai_action value enhance-prompt', async () => {
    const { aiActionsService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.AI_ACTION,
      { action: 'enhance-prompt', content: 'improve this' },
      {
        organizationId: testId('org2'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(aiActionsService.execute).toHaveBeenCalledWith(
      testId('org2'),
      expect.objectContaining({
        action: AiActionType.ENHANCE_PROMPT,
        content: 'improve this',
      }),
    );
  });

  it('should execute rate_content successfully', async () => {
    const { contentQualityScorerService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.RATE_CONTENT,
      {
        contentId: testId('content'),
        contentType: 'image',
      },
      {
        organizationId: testId('org2'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        category: 'good',
        score: 7,
      }),
    );
    expect(contentQualityScorerService.scoreContent).toHaveBeenCalledWith(
      testId('content'),
      'image',
      undefined,
      testId('org2'),
    );
  });

  it('rejects stale thread scope before dispatching a tool', async () => {
    const { agentScopeContextService, batchGenerationService, service } =
      createService();
    agentScopeContextService.assertConsequentialBoundary.mockRejectedValue(
      new Error('Agent context is stale.'),
    );

    const result = await service.executeTool(
      AgentToolName.GENERATE_CONTENT_BATCH,
      { count: 2, platforms: ['instagram'] },
      {
        brandId: 'brand-1',
        organizationId: testId('org2'),
        threadId: 'thread-1',
        userId: testId('user'),
        validatedScope: {
          brandId: 'brand-1',
          contextVersion: 2,
          isLegacyFallback: false,
          isVersionExplicit: true,
          organizationId: testId('org2'),
          source: 'explicit',
          threadId: 'thread-1',
          userId: testId('user'),
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        error: 'Agent context is stale.',
        success: false,
      }),
    );
    expect(batchGenerationService.processBatch).not.toHaveBeenCalled();
  });

  it('should fail rate_content when contentId is missing', async () => {
    const { contentQualityScorerService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.RATE_CONTENT,
      { contentType: 'image' },
      {
        organizationId: testId('org2'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('contentId is required');
    expect(contentQualityScorerService.scoreContent).not.toHaveBeenCalled();
  });

  it('should fail rate_content when scorer service is unavailable', async () => {
    const {
      adsResearchService,
      aiActionsService,
      brandsService,
      credentialsService,
      imagesService,
      instagramInspirationHandler,
      loggerService,
      organizationsService,
      postsService,
      usersService,
      workflowsService,
    } = createService();

    const generationGatewayWithoutScorer = {
      generateArticle: vi.fn(),
      generateAvatarVideo: vi.fn(),
      generateImage: vi.fn(),
      generateMusic: vi.fn(),
      generateVideo: vi.fn(),
      generateVoice: vi.fn(),
      reframeImage: vi.fn(),
      upscaleImage: vi.fn(),
    };
    const publishHandlerWithoutScorer = new AgentPublishToolHandler(
      {} as never,
      postsService as never,
      loggerService,
      undefined,
      credentialsService as never,
      undefined,
    );
    const onboardingWithoutScorer = new AgentOnboardingToolHandler(
      loggerService,
      { get: vi.fn().mockReturnValue('http://localhost:3010') } as never,
      brandsService as never,
      postsService as never,
      {} as never,
      {} as never,
      generationGatewayWithoutScorer as never,
      credentialsService as never,
      imagesService as never,
      organizationsService as never,
      { findOne: vi.fn().mockResolvedValue({}) } as never,
      usersService as never,
      undefined,
      undefined,
    );
    const systemWorkflowRunner = createWorkflowRunner();
    const serviceWithoutScorer = new AgentToolExecutorService(
      loggerService,
      new AgentRouteRewriteService(
        loggerService,
        brandsService as never,
        organizationsService as never,
      ),
      new AgentMemoryGoalsToolHandler(undefined as never, undefined as never),
      new AgentDashboardToolHandler(undefined, undefined),
      publishHandlerWithoutScorer,
      new AgentCampaignToolHandler({} as never),
      new AgentLivestreamToolHandler(
        brandsService as never,
        {} as never,
        {} as never,
      ),
      instagramInspirationHandler,
      new AgentXActionsToolHandler(
        loggerService,
        {} as never,
        credentialsService as never,
        undefined,
      ),
      new AgentBrandInterviewToolHandler(undefined),
      new AgentWorkspaceToolHandler(
        {} as never,
        brandsService as never,
        postsService as never,
        { listCharacterMentions: vi.fn().mockResolvedValue([]) } as never,
      ),
      new AgentConnectionToolHandler(credentialsService as never),
      new AgentTrendsToolHandler({
        getTrends: vi.fn().mockResolvedValue([]),
      } as never),
      new AgentProactiveToolHandler(
        loggerService,
        postsService as never,
        {} as never,
        undefined,
      ),
      new AgentQualityToolHandler(
        loggerService,
        undefined,
        undefined,
        undefined,
        undefined,
        imagesService as never,
      ),
      new AgentReviewToolHandler({} as never),
      new AgentAdsResearchToolHandler(
        adsResearchService as never,
        brandsService as never,
      ),
      onboardingWithoutScorer,
      new AgentAnalyticsToolHandler(
        postsService as never,
        {} as never,
        {} as never,
        publishHandlerWithoutScorer,
        undefined,
        undefined,
      ),
      new AgentWorkflowToolHandler(
        new AgentWorkflowToolInstallService(
          { get: vi.fn() } as never,
          workflowsService as never,
          brandsService as never,
          { install: vi.fn(), listCatalogForOrganization: vi.fn() } as never,
          new AgentWorkflowToolCreateService(
            workflowsService as never,
            brandsService as never,
          ),
        ),
        new AgentWorkflowToolCreateService(
          workflowsService as never,
          brandsService as never,
        ),
        new AgentWorkflowToolExecuteService(
          workflowsService as never,
          { findOne: vi.fn() } as never,
          { updateSchedule: vi.fn() } as never,
          { findAll: vi.fn(), findOne: vi.fn() } as never,
          { runAuthenticated: vi.fn() } as never,
        ),
      ),
      new AgentMediaGenerationToolHandler(
        new AgentMediaTextGenerationService(
          aiActionsService as never,
          {} as never,
          {} as never,
          generationGatewayWithoutScorer as never,
        ),
        new AgentMediaAssetGenerationService(
          loggerService,
          { get: vi.fn() } as never,
          generationGatewayWithoutScorer as never,
          onboardingWithoutScorer,
          undefined, // contentQualityScorerService intentionally absent
        ),
        new AgentMediaBatchGenerationService(
          loggerService,
          brandsService as never,
          { queueBatch: vi.fn().mockResolvedValue('job-1') } as never,
          {} as never,
          credentialsService as never,
        ),
      ),
      new AgentToolCatalogHandler(),
      new AgentBrandContentToolHandler(
        loggerService,
        brandsService as never,
        {} as never,
      ),
      new AgentPrepareToolHandler(
        brandsService as never,
        workflowsService as never,
        { findOne: vi.fn().mockResolvedValue({}) } as never,
        { findAll: vi.fn().mockResolvedValue({ docs: [] }) } as never,
      ),
      new AgentSpawnToolHandler(loggerService, undefined),
      undefined as never, // agentScopeContextService
      undefined,
      systemWorkflowRunner as never,
    );
    serviceWithoutScorer.onModuleInit();

    const result = await serviceWithoutScorer.executeTool(
      AgentToolName.RATE_CONTENT,
      { contentId: testId('content') },
      {
        organizationId: testId('org2'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('ContentQualityScorerService not available');
  });

  it('emits a confirmation preview before installing an official workflow', async () => {
    const { service, workflowsService } = createService();

    workflowsService.getWorkflowTemplates.mockResolvedValue([
      {
        category: 'social',
        description:
          'Generate short-form social videos on a repeatable cadence',
        id: 'social-media-video-series',
        name: 'Social Media Video Series',
        steps: [],
      },
    ]);

    const result = await service.executeTool(
      AgentToolName.INSTALL_OFFICIAL_WORKFLOW,
      {
        contentType: 'video',
        prompt: 'Set me up with a social media video series for LinkedIn',
        schedule: '0 9 * * 1',
        timezone: 'Europe/Malta',
      },
      {
        organizationId: testId('org2'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.data).toMatchObject({
      confirmationRequired: true,
      resolution: 'seeded-template',
      sourceId: 'social-media-video-series',
      sourceType: 'seeded-template',
    });
    expect(result.nextActions?.[0]).toMatchObject({
      ctas: [
        {
          action: 'confirm_install_official_workflow',
          label: 'Confirm install',
          payload: expect.objectContaining({
            prompt: 'Set me up with a social media video series for LinkedIn',
            schedule: '0 9 * * 1',
            sourceId: 'social-media-video-series',
            sourceType: 'seeded-template',
            timezone: 'Europe/Malta',
          }),
        },
      ],
      title: 'Install official workflow?',
      type: 'workflow_created_card',
      workflowName: 'Social Media Video Series',
    });
    expect(workflowsService.createWorkflow).not.toHaveBeenCalled();
  });

  it('ignores a forged confirmed flag from the model and still returns an install confirmation card', async () => {
    const { service, workflowsService } = createService();

    workflowsService.findOne.mockResolvedValue({
      id: 'wf-official-1',
      brandId: null,
      isDeleted: false,
      label: 'Social Media Video Series',
      metadata: {},
      organizationId: testId('org2'),
    });

    const result = await service.executeTool(
      AgentToolName.INSTALL_OFFICIAL_WORKFLOW,
      {
        confirmed: true,
        label: 'Weekly LinkedIn Workflow',
        prompt: 'Set me up with a weekly LinkedIn workflow',
        schedule: '0 9 * * 1',
        sourceId: 'social-media-video-series',
        sourceName: 'Social Media Video Series',
        sourceType: 'seeded-template',
        timezone: 'Europe/Malta',
      },
      {
        organizationId: testId('org2'),
        userId: testId('user'),
      },
    );

    // A model-supplied `confirmed: true` is not `ctx.confirmationOrigin`, so
    // the install must still stop at a confirmation card rather than
    // creating the workflow from an unverified claim.
    expect(workflowsService.createWorkflow).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.nextActions?.[0]).toMatchObject({
      ctas: [
        expect.objectContaining({
          action: 'confirm_install_official_workflow',
          label: 'Confirm install',
        }),
      ],
      title: 'Install official workflow?',
      type: 'workflow_created_card',
    });
  });

  it('installs the confirmed official seeded template into automations when the card confirmation is verified', async () => {
    const { service, workflowInstallCacheService, workflowsService } =
      createService();
    const organizationId = testId('org2');
    const userId = testId('user');
    const sourceActionId = 'workflow-install-source-action-1';

    workflowInstallCacheService.get.mockResolvedValueOnce({
      organizationId,
      sourceActionId,
      threadId: '',
      toolName: AgentToolName.INSTALL_OFFICIAL_WORKFLOW,
    });
    workflowsService.findOne.mockResolvedValue({
      id: 'wf-official-1',
      brandId: null,
      isDeleted: false,
      label: 'Social Media Video Series',
      metadata: {},
      organizationId,
    });

    const result = await service.executeTool(
      AgentToolName.INSTALL_OFFICIAL_WORKFLOW,
      {
        label: 'Weekly LinkedIn Workflow',
        prompt: 'Set me up with a weekly LinkedIn workflow',
        schedule: '0 9 * * 1',
        sourceActionId,
        sourceId: 'social-media-video-series',
        sourceName: 'Social Media Video Series',
        sourceType: 'seeded-template',
        timezone: 'Europe/Malta',
      },
      {
        confirmationOrigin: 'thread-ui-action',
        organizationId,
        userId,
      },
    );

    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      userId,
      organizationId,
      expect.objectContaining({
        isScheduleEnabled: true,
        schedule: '0 9 * * 1',
        templateId: 'social-media-video-series',
        timezone: 'Europe/Malta',
        trigger: 'manual',
      }),
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      editorUrl: `/automation/workflows/${result.data?.id}`,
      installedFrom: 'seeded-template',
    });
    expect(result.nextActions?.[0]?.ctas?.[0]).toMatchObject({
      href: `/automation/workflows/${result.data?.id}`,
      label: 'Open workflow',
    });
  });

  it('rejects an install confirmation whose sourceActionId does not match a pending confirmation', async () => {
    const { service, workflowInstallCacheService, workflowsService } =
      createService();
    const organizationId = testId('org2');
    const userId = testId('user');

    workflowInstallCacheService.get.mockResolvedValueOnce(null);

    const result = await service.executeTool(
      AgentToolName.INSTALL_OFFICIAL_WORKFLOW,
      {
        sourceActionId: 'unknown-source-action',
        sourceId: 'social-media-video-series',
        sourceName: 'Social Media Video Series',
        sourceType: 'seeded-template',
      },
      {
        confirmationOrigin: 'thread-ui-action',
        organizationId,
        userId,
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'sourceActionId does not match a persisted workflow install confirmation.',
    );
    expect(workflowsService.createWorkflow).not.toHaveBeenCalled();
  });

  it('prefers the brand default voice when preparing voice clone recommendations', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const {
      brandsService,
      organizationSettingsService,
      service,
      voicesService,
    } = createService();

    brandsService.findOne.mockResolvedValue({
      id: testId('currentbrand'),
      agentConfig: {
        defaultVoiceId: testId('voicebrand'),
      },
      isSelected: true,
      label: 'Genfeed',
    });
    organizationSettingsService.findOne.mockResolvedValue({
      id: 'settings-1',
      defaultVoiceId: testId('voiceorg'),
      onboardingJourneyMissions: [],
    });
    voicesService.findAll.mockResolvedValue({
      docs: [
        {
          id: testId('voicefallback'),
          cloneStatus: 'ready',
          metadataLabel: 'Fallback Voice',
          provider: 'elevenlabs',
        },
      ],
    });

    const result = await service.executeTool(
      AgentToolName.PREPARE_VOICE_CLONE,
      {},
      {
        organizationId: testId('org2'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(voicesService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ isCloned: true }, { externalVoiceCatalogId: { not: null } }],
        }),
      }),
      {},
    );
    expect(result.nextActions?.[0]).toMatchObject({
      id: 'voice-clone-1700000000000',
      recommendedVoiceId: testId('voicebrand'),
      type: 'voice_clone_card',
    });

    nowSpy.mockRestore();
  });

  it('falls back to the organization default voice when the brand has none', async () => {
    const {
      brandsService,
      organizationSettingsService,
      service,
      voicesService,
    } = createService();

    brandsService.findOne.mockResolvedValue({
      id: testId('currentbrand'),
      agentConfig: {},
      isSelected: true,
      label: 'Genfeed',
    });
    organizationSettingsService.findOne.mockResolvedValue({
      id: 'settings-1',
      defaultVoiceId: testId('voiceorg'),
      onboardingJourneyMissions: [],
    });
    voicesService.findAll.mockResolvedValue({
      docs: [
        {
          id: testId('voicefallback'),
          cloneStatus: 'ready',
          metadataLabel: 'Fallback Voice',
          provider: 'elevenlabs',
        },
      ],
    });

    const result = await service.executeTool(
      AgentToolName.PREPARE_VOICE_CLONE,
      {},
      {
        organizationId: testId('org2'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.nextActions?.[0]).toMatchObject({
      recommendedVoiceId: testId('voiceorg'),
      type: 'voice_clone_card',
    });
  });

  it('falls back to the first ready cloned voice when no defaults are configured', async () => {
    const {
      brandsService,
      organizationSettingsService,
      service,
      voicesService,
    } = createService();

    brandsService.findOne.mockResolvedValue({
      id: testId('currentbrand'),
      agentConfig: {},
      isSelected: true,
      label: 'Genfeed',
    });
    organizationSettingsService.findOne.mockResolvedValue({
      id: 'settings-1',
      onboardingJourneyMissions: [],
    });
    voicesService.findAll.mockResolvedValue({
      docs: [
        {
          id: testId('brandfallback'),
          cloneStatus: 'processing',
          metadataLabel: 'Still Processing',
          provider: 'elevenlabs',
        },
        {
          id: testId('voicefallback'),
          cloneStatus: 'ready',
          metadataLabel: 'Fallback Voice',
          provider: 'elevenlabs',
        },
      ],
    });

    const result = await service.executeTool(
      AgentToolName.PREPARE_VOICE_CLONE,
      {},
      {
        organizationId: testId('org2'),
        userId: testId('user'),
      },
    );

    expect(result.success).toBe(true);
    expect(result.nextActions?.[0]).toMatchObject({
      recommendedVoiceId: testId('voicefallback'),
      type: 'voice_clone_card',
    });
  });

  it('returns purchase CTA only for paid official marketplace workflows', async () => {
    const { marketplaceApiClient, service, workflowInstallCacheService } =
      createService();
    const organizationId = testId('org2');
    const userId = testId('user');
    const sourceActionId = 'workflow-install-marketplace-action-1';

    marketplaceApiClient.getListing.mockResolvedValue({
      id: 'listing-1',
      isDeleted: false,
      price: 49,
      pricingTier: 'premium',
      slug: 'official-linkedin-workflow',
    });
    marketplaceApiClient.checkListingOwnership.mockResolvedValue({
      owned: false,
      purchase: null,
    });
    workflowInstallCacheService.get.mockResolvedValueOnce({
      organizationId,
      sourceActionId,
      threadId: '',
      toolName: AgentToolName.INSTALL_OFFICIAL_WORKFLOW,
    });

    const result = await service.executeTool(
      AgentToolName.INSTALL_OFFICIAL_WORKFLOW,
      {
        prompt: 'Install the official LinkedIn workflow',
        sourceActionId,
        sourceDescription: 'Official LinkedIn workflow',
        sourceId: 'listing-1',
        sourceName: 'Official LinkedIn Workflow',
        sourceSlug: 'official-linkedin-workflow',
        sourceType: 'marketplace-listing',
      },
      {
        confirmationOrigin: 'thread-ui-action',
        organizationId,
        userId,
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      listingId: 'listing-1',
      requiresPurchase: true,
    });
    expect(result.nextActions?.[0]).toMatchObject({
      ctas: [
        {
          href: expect.stringContaining('/official-linkedin-workflow'),
          label: 'Open marketplace listing',
        },
      ],
      title: 'Purchase required',
      type: 'workflow_created_card',
    });
  });

  // ──────────────────────────────────────────────
  // Workflow agent-tool path tests
  // ──────────────────────────────────────────────

  const CTX = {
    organizationId: testId('org2'),
    userId: testId('user'),
  };

  it('render_dashboard preserves an explicit replace operation', async () => {
    const { service } = createService();
    const blocks = [
      {
        id: 'views',
        title: 'Views',
        type: 'metric_card',
        value: 42,
      },
    ];

    const result = await service.executeTool(
      AgentToolName.RENDER_DASHBOARD,
      { blocks, operation: 'replace' },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ blocks, operation: 'replace' });
  });

  it('render_dashboard rejects unknown operations instead of replacing the dashboard', async () => {
    const { service } = createService();

    const result = await service.executeTool(
      AgentToolName.RENDER_DASHBOARD,
      {
        blocks: [{ id: 'views', type: 'metric_card', value: 42 }],
        operation: 'merge',
      },
      CTX,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unsupported dashboard operation: merge');
    expect(result.data).toBeUndefined();
  });

  it('list_workflows returns workflows from the org', async () => {
    const { service, workflowsService } = createService();

    workflowsService.findAll.mockResolvedValue({
      docs: [
        {
          id: testId('content'),
          description: 'Weekly posts',
          name: 'Content Pipeline',
          status: 'active',
          updatedAt: new Date('2026-03-15'),
        },
      ],
    });

    const result = await service.executeTool(
      AgentToolName.LIST_WORKFLOWS,
      { limit: 5 },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(result.data.count).toBe(1);
    expect(result.data.workflows[0]).toEqual(
      expect.objectContaining({
        id: testId('content'),
        name: 'Content Pipeline',
        status: 'active',
      }),
    );
  });

  it('list_workflows returns empty when no workflows exist', async () => {
    const { service, workflowsService } = createService();

    workflowsService.findAll.mockResolvedValue({ docs: [] });

    const result = await service.executeTool(
      AgentToolName.LIST_WORKFLOWS,
      {},
      CTX,
    );

    expect(result.success).toBe(true);
    expect(result.data.count).toBe(0);
    expect(result.data.workflows).toEqual([]);
  });

  it('inspect_workflow returns one workflow without mutating it', async () => {
    const { service, workflowsService } = createService();

    workflowsService.findOne.mockResolvedValue({
      id: 'wf-1',
      inputVariables: [{ key: 'topic', required: true, type: 'text' }],
      isScheduleEnabled: true,
      label: 'System Workflow',
      metadata: { systemWorkflow: true },
      nodes: [{ id: 'node-1' }, { id: 'node-2' }],
      organizationId: CTX.organizationId,
      schedule: '0 9 * * *',
      status: 'draft',
      timezone: 'UTC',
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    });

    const result = await service.executeTool(
      AgentToolName.INSPECT_WORKFLOW,
      { workflowId: 'wf-1' },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(result.data.workflow).toEqual(
      expect.objectContaining({
        id: 'wf-1',
        isScheduleEnabled: true,
        label: 'System Workflow',
        nodeCount: 2,
        schedule: '0 9 * * *',
      }),
    );
  });

  it('duplicate_workflow clones through WorkflowsService with user and organization scope', async () => {
    const { service, workflowsService } = createService();

    const result = await service.executeTool(
      AgentToolName.DUPLICATE_WORKFLOW,
      { workflowId: 'wf-1' },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(workflowsService.cloneWorkflow).toHaveBeenCalledWith(
      'wf-1',
      CTX.userId,
      CTX.organizationId,
      CTX.brandId,
    );
    expect(result.data.workflow).toEqual(
      expect.objectContaining({
        id: 'workflow-copy-1',
        label: 'System Workflow (Copy)',
      }),
    );
  });

  it('execute_workflow triggers workflow and returns execution id', async () => {
    const { service, workflowsService, workflowExecutorService } =
      createService();

    workflowsService.findOne.mockResolvedValue({
      id: 'wf-1',
      inputVariables: [],
      isDeleted: false,
      organizationId: CTX.organizationId,
    });

    const result = await service.executeTool(
      AgentToolName.EXECUTE_WORKFLOW,
      { inputs: { topic: 'AI' }, workflowId: 'wf-1' },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 'exec-1', status: 'queued' });
    expect(workflowExecutorService.executeManualWorkflow).toHaveBeenCalledWith(
      'wf-1',
      CTX.userId,
      CTX.organizationId,
      { topic: 'AI' },
    );
  });

  it('execute_workflow returns error when workflow not found', async () => {
    const { service, workflowsService } = createService();

    workflowsService.findOne.mockResolvedValue(null);

    const result = await service.executeTool(
      AgentToolName.EXECUTE_WORKFLOW,
      { workflowId: 'missing-wf' },
      CTX,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('execute_workflow rejects when required inputs are missing', async () => {
    const { service, workflowsService } = createService();

    workflowsService.findOne.mockResolvedValue({
      id: 'wf-2',
      inputVariables: [
        { key: 'topic', label: 'Topic', required: true, type: 'text' },
        { key: 'style', label: 'Style', required: false, type: 'select' },
      ],
      isDeleted: false,
      organizationId: CTX.organizationId,
    });

    const result = await service.executeTool(
      AgentToolName.EXECUTE_WORKFLOW,
      { inputs: {}, workflowId: 'wf-2' },
      CTX,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('topic');
    expect(result.error).toContain('get_workflow_inputs');
  });

  it('execute_workflow passes when all required inputs are provided', async () => {
    const { service, workflowsService } = createService();

    workflowsService.findOne.mockResolvedValue({
      id: 'wf-2',
      inputVariables: [
        { key: 'topic', label: 'Topic', required: true, type: 'text' },
      ],
      isDeleted: false,
      organizationId: CTX.organizationId,
    });

    const result = await service.executeTool(
      AgentToolName.EXECUTE_WORKFLOW,
      { inputs: { topic: 'AI trends' }, workflowId: 'wf-2' },
      CTX,
    );

    expect(result.success).toBe(true);
  });

  it('set_workflow_schedule enables a duplicate through the workflow scheduler', async () => {
    const { service, workflowSchedulerService, workflowsService } =
      createService();
    workflowsService.findOne.mockResolvedValue({
      id: 'wf-copy-1',
      isDeleted: false,
      organizationId: CTX.organizationId,
    });
    workflowSchedulerService.updateSchedule.mockResolvedValue({
      id: 'wf-copy-1',
      isScheduleEnabled: true,
      schedule: '0 9 * * *',
      timezone: 'UTC',
    });

    const result = await service.executeTool(
      AgentToolName.SET_WORKFLOW_SCHEDULE,
      {
        enabled: true,
        schedule: '0 9 * * *',
        timezone: 'UTC',
        workflowId: 'wf-copy-1',
      },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(workflowSchedulerService.updateSchedule).toHaveBeenCalledWith(
      'wf-copy-1',
      '0 9 * * *',
      'UTC',
      true,
    );
  });

  it('set_workflow_schedule disables a duplicate while preserving the stored cron', async () => {
    const { service, workflowSchedulerService, workflowsService } =
      createService();
    workflowsService.findOne.mockResolvedValue({
      id: 'wf-copy-1',
      isDeleted: false,
      isScheduleEnabled: true,
      organizationId: CTX.organizationId,
      schedule: '0 9 * * *',
      timezone: 'Europe/Malta',
    });
    workflowSchedulerService.updateSchedule.mockResolvedValue({
      id: 'wf-copy-1',
      isScheduleEnabled: false,
      schedule: '0 9 * * *',
      timezone: 'Europe/Malta',
    });

    const result = await service.executeTool(
      AgentToolName.SET_WORKFLOW_SCHEDULE,
      { enabled: false, workflowId: 'wf-copy-1' },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(workflowSchedulerService.updateSchedule).toHaveBeenCalledWith(
      'wf-copy-1',
      '0 9 * * *',
      'Europe/Malta',
      false,
    );
  });

  it('list_workflow_runs returns scoped run history from the workflow executions service', async () => {
    const { service, workflowExecutionsService } = createService();
    workflowExecutionsService.findAll.mockResolvedValue({
      docs: [{ id: 'run-1', attributes: { status: 'completed' } }],
    });

    const result = await service.executeTool(
      AgentToolName.LIST_WORKFLOW_RUNS,
      { limit: 5, status: 'completed', workflowId: 'wf-1' },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(result.data.count).toBe(1);
    expect(workflowExecutionsService.findAll).toHaveBeenCalledWith(
      {
        orderBy: { createdAt: -1 },
        where: {
          isDeleted: false,
          organizationId: CTX.organizationId,
          status: 'completed',
          workflowId: 'wf-1',
        },
      },
      { limit: 5, page: 1 },
    );
  });

  it('get_workflow_run returns one workflow run from the workflow executions service', async () => {
    const { service, workflowExecutionsService } = createService();
    workflowExecutionsService.findOne.mockResolvedValue({
      id: 'run-1',
      attributes: { progress: 100 },
    });

    const result = await service.executeTool(
      AgentToolName.GET_WORKFLOW_RUN,
      { runId: 'run-1' },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(result.data.run).toEqual({
      id: 'run-1',
      attributes: { progress: 100 },
    });
    expect(workflowExecutionsService.findOne).toHaveBeenCalledWith({
      id: 'run-1',
      organizationId: CTX.organizationId,
    });
  });

  it('get_workflow_inputs returns input variable definitions', async () => {
    const { service, workflowsService } = createService();

    workflowsService.findOne.mockResolvedValue({
      id: 'wf-3',
      inputVariables: [
        {
          defaultValue: null,
          description: 'Main topic for the content',
          key: 'topic',
          label: 'Topic',
          required: true,
          type: 'text',
        },
        {
          defaultValue: 'casual',
          description: null,
          key: 'style',
          label: 'Style',
          required: false,
          type: 'select',
        },
      ],
      name: 'Weekly Pipeline',
    });

    const result = await service.executeTool(
      AgentToolName.GET_WORKFLOW_INPUTS,
      { workflowId: 'wf-3' },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(result.data.workflowId).toBe('wf-3');
    expect(result.data.workflowName).toBe('Weekly Pipeline');
    expect(result.data.inputs).toHaveLength(2);
    expect(result.data.inputs[0]).toEqual(
      expect.objectContaining({
        key: 'topic',
        label: 'Topic',
        required: true,
        type: 'text',
      }),
    );
  });

  it('get_workflow_inputs returns error for non-existent workflow', async () => {
    const { service, workflowsService } = createService();

    workflowsService.findOne.mockResolvedValue(null);

    const result = await service.executeTool(
      AgentToolName.GET_WORKFLOW_INPUTS,
      { workflowId: 'missing' },
      CTX,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  // ──────────────────────────────────────────────
  // BRAND CONTEXT INTERVIEW TOOLS
  // ──────────────────────────────────────────────

  it('start_brand_interview calls engine start and returns interview data', async () => {
    const { brandInterviewService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.START_BRAND_INTERVIEW,
      { brandId: testId('org2') },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(brandInterviewService.start).toHaveBeenCalledWith(
      testId('org2'),
      CTX.organizationId,
      CTX.userId,
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        interviewId: 'interview-1',
        status: 'in_progress',
        completenessScore: 40,
      }),
    );
    expect(result.creditsUsed).toBe(10);
  });

  it('start_brand_interview returns error when brandId is missing', async () => {
    const { service } = createService();

    const result = await service.executeTool(
      AgentToolName.START_BRAND_INTERVIEW,
      {},
      CTX,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('brandId');
  });

  it('submit_brand_interview_answer calls engine submitAnswer and returns next question', async () => {
    const { brandInterviewService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.SUBMIT_BRAND_INTERVIEW_ANSWER,
      { interviewId: 'interview-1', answer: 'Developers and startup founders' },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(brandInterviewService.submitAnswer).toHaveBeenCalledWith(
      'interview-1',
      CTX.organizationId,
      CTX.userId,
      'Developers and startup founders',
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        interviewId: 'interview-1',
        isComplete: false,
        completenessScore: 50,
      }),
    );
    expect(result.creditsUsed).toBe(0);
  });

  it('skip_brand_interview_question calls engine skipField and returns next question', async () => {
    const { brandInterviewService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.SKIP_BRAND_INTERVIEW_QUESTION,
      { interviewId: 'interview-1' },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(brandInterviewService.skipField).toHaveBeenCalledWith(
      'interview-1',
      CTX.organizationId,
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        interviewId: 'interview-1',
        isComplete: false,
      }),
    );
    expect(result.creditsUsed).toBe(0);
  });

  it('get_brand_completeness calls engine getCompleteness and returns score', async () => {
    const { brandInterviewService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.GET_BRAND_COMPLETENESS,
      { brandId: testId('org2') },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(brandInterviewService.getCompleteness).toHaveBeenCalledWith(
      testId('org2'),
      CTX.organizationId,
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        overallScore: 40,
        incompleteFieldKeys: expect.arrayContaining(['audience', 'tone']),
      }),
    );
    expect(result.creditsUsed).toBe(0);
  });
});
