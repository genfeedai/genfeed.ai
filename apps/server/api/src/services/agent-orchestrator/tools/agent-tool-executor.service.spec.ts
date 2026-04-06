vi.mock(
  '@api/collections/outreach-campaigns/services/outreach-campaigns.service',
  () => ({
    OutreachCampaignsService: class OutreachCampaignsService {},
  }),
);

import 'reflect-metadata';
import { AiActionType } from '@api/endpoints/ai-actions/dto/ai-action.dto';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { PostStatus } from '@genfeedai/enums';
import { AgentToolName } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Effect } from 'effect';
import { Types } from 'mongoose';

const CREATE_LIVESTREAM_BOT_TOOL = 'create_livestream_bot' as AgentToolName;
const MANAGE_LIVESTREAM_BOT_TOOL = 'manage_livestream_bot' as AgentToolName;
const DRAFT_BRAND_VOICE_PROFILE_TOOL =
  'draft_brand_voice_profile' as AgentToolName;
const SAVE_BRAND_VOICE_PROFILE_TOOL =
  'save_brand_voice_profile' as AgentToolName;

describe('AgentToolExecutorService', () => {
  const createService = () => {
    const recurringWorkflowId = new Types.ObjectId().toString();
    const loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    const configService = {
      get: vi.fn().mockReturnValue('http://localhost:3001'),
    };

    const httpService = {} as never;
    const postsService = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      handleYoutubePost: vi.fn(),
    };
    const brandsService = {
      create: vi.fn().mockResolvedValue({ _id: 'brand-1' }),
      findOne: vi.fn(),
      generateBrandVoice: vi.fn().mockResolvedValue({
        audience: ['founders', 'marketers'],
        doNotSoundLike: ['corporate jargon', 'broetry'],
        hashtags: ['#genfeed'],
        messagingPillars: ['clarity', 'speed', 'proof'],
        sampleOutput: 'Clear systems beat noisy hustle.',
        style: 'direct',
        taglines: ['Ship with signal'],
        tone: 'confident',
        values: ['clarity', 'speed'],
      }),
      updateAgentConfig: vi.fn().mockResolvedValue({ _id: 'brand-1' }),
    };
    const livestreamBotId = new Types.ObjectId();
    const botsService = {
      create: vi
        .fn()
        .mockImplementation(async (dto: Record<string, unknown>) => ({
          _id: livestreamBotId,
          brand: dto.brand,
          category: dto.category,
          label: dto.label,
          livestreamSettings: dto.livestreamSettings,
          organization: dto.organization,
          platforms: dto.platforms,
          targets: dto.targets,
          user: dto.user,
        })),
      findOne: vi.fn().mockResolvedValue({
        _id: livestreamBotId,
        brand: new Types.ObjectId('67a1234567890123456789aa'),
        category: 'livestream_chat',
        label: 'Launch Live Bot',
        livestreamSettings: { automaticPosting: true },
        organization: new Types.ObjectId('67a123456789012345678901'),
        platforms: ['youtube'],
        targets: [
          {
            channelId: 'UC-live-1',
            isEnabled: true,
            platform: 'youtube',
          },
        ],
        user: new Types.ObjectId('67a123456789012345678902'),
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
    const workflowsService = {
      createWorkflow: vi.fn().mockResolvedValue({
        _id: recurringWorkflowId,
        schedule: '0 17 * * *',
      }),
      findAll: vi.fn().mockResolvedValue({ docs: [] }),
      findOne: vi.fn(),
      getWorkflowTemplates: vi.fn().mockResolvedValue([]),
      patch: vi.fn().mockResolvedValue({}),
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
              data: { config: {}, label: 'Start' },
              id: 'node-1',
              position: { x: 0, y: 0 },
              type: 'ai-generate-post',
            },
            {
              data: { config: {}, label: 'Finish' },
              id: 'node-2',
              position: { x: 240, y: 0 },
              type: 'ai-generate-post',
            },
          ],
        },
      }),
    };
    const listingsService = {
      findOne: vi.fn(),
      getPublicListings: vi.fn().mockResolvedValue({ docs: [] }),
    };
    const purchasesService = {
      checkListingOwnership: vi.fn(),
      claimFreeItem: vi.fn(),
    };
    const installService = {
      installToWorkspace: vi.fn(),
    };
    const workflowExecutorService = {
      executeManualWorkflow: vi.fn().mockResolvedValue({
        executionId: 'exec-1',
        status: 'queued',
      }),
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
    const creditsUtilsService = {
      addOrganizationCreditsWithExpiration: vi
        .fn()
        .mockResolvedValue(undefined),
      getOrganizationCreditsWithExpiration: vi.fn().mockResolvedValue({
        credits: [],
        totalBalance: 0,
      }),
    };
    const batchGenerationService = {
      createBatch: vi.fn().mockResolvedValue({
        id: '67a1234567890123456789ba',
        status: 'pending',
        totalCount: 10,
      }),
      processBatch: vi.fn().mockResolvedValue(undefined),
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
    };
    const organizationsService = {
      findOne: vi.fn().mockResolvedValue({ onboardingCompleted: false }),
      patch: vi.fn().mockResolvedValue({}),
    };
    const organizationSettingsService = {
      findOne: vi.fn().mockResolvedValue({
        _id: 'settings-1',
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
          _id: 'memory-1',
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
      findOne: vi.fn().mockResolvedValue({ _id: 'user-db-1' }),
      patch: vi.fn().mockResolvedValue({}),
    };
    const clerkService = {
      getUser: vi.fn().mockResolvedValue({
        publicMetadata: {
          brand: '67a1234567890123456789ab',
        },
      }),
      updateUserPublicMetadata: vi.fn().mockResolvedValue({}),
    };
    const agentGoalsService = {
      create: vi.fn().mockResolvedValue({
        _id: 'goal-1',
        currentValue: 250,
        label: 'Grow views',
        metric: 'views',
        progressPercent: 25,
        targetValue: 1000,
      }),
      refreshProgress: vi.fn().mockResolvedValue({
        _id: 'goal-1',
        currentValue: 250,
        label: 'Grow views',
        metric: 'views',
        progressPercent: 25,
        targetValue: 1000,
      }),
      update: vi.fn().mockResolvedValue({
        _id: 'goal-1',
        currentValue: 400,
        label: 'Grow views',
        metric: 'views',
        progressPercent: 40,
        targetValue: 1000,
      }),
    };

    const campaignsService = { findOne: vi.fn() };

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

    const service = new AgentToolExecutorService(
      loggerService,
      configService as never,
      httpService,
      postsService as never,
      brandsService as never,
      botsService as never,
      botsLivestreamService as never,
      campaignsService as never,
      workflowExecutorService as never,
      workflowsService as never,
      workflowGenerationService as never,
      listingsService as never,
      purchasesService as never,
      installService as never,
      trendsService,
      aiActionsService as never,
      analyticsService as never,
      postAnalyticsService as never,
      contentGeneratorService,
      creditsUtilsService as never,
      batchGenerationService as never,
      credentialsService as never,
      organizationsService as never,
      organizationSettingsService as never,
      agentMemoryCaptureService as never,
      usersService as never,
      clerkService as never,
      streamPublisher as never,
      undefined as never, // agentSpawnService
      imagesService as never,
      voicesService as never,
      contentQualityScorerService as never,
      agentGoalsService as never,
      ingredientsService as never,
      {} as never, // votesService
      adsResearchService as never,
    );

    return {
      adsResearchService,
      agentGoalsService,
      agentMemoryCaptureService,
      aiActionsService,
      analyticsService,
      batchGenerationService,
      botsLivestreamService,
      botsService,
      brandsService,
      clerkService,
      contentQualityScorerService,
      credentialsService,
      creditsUtilsService,
      imagesService,
      ingredientsService,
      installService,
      listingsService,
      livestreamBotId: livestreamBotId.toString(),
      loggerService,
      organizationSettingsService,
      organizationsService,
      postAnalyticsService,
      postsService,
      purchasesService,
      recurringWorkflowId,
      service,
      streamPublisher,
      trendsService,
      usersService,
      voicesService,
      workflowExecutorService,
      workflowGenerationService,
      workflowsService,
    };
  };

  it('should create a goal via agent tool', async () => {
    const { agentGoalsService, service } = createService();

    const result = await service.executeTool(
      'create_goal' as AgentToolName,
      {
        label: 'Grow views',
        metric: 'views',
        targetValue: 1000,
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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

  it('should reject invalid goal ids for progress checks', async () => {
    const { service } = createService();

    const result = await service.executeTool(
      'check_goal_progress' as AgentToolName,
      { goalId: 'not-an-object-id' },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('valid goalId');
  });

  it('should update a goal via agent tool', async () => {
    const { agentGoalsService, service } = createService();

    const result = await service.executeTool(
      'update_goal' as AgentToolName,
      {
        goalId: '67a123456789012345678903',
        targetValue: 1000,
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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

  it('returns a publish confirmation card for direct content publish requests', async () => {
    const { credentialsService, ingredientsService, service } = createService();

    ingredientsService.findOne.mockResolvedValue({
      _id: new Types.ObjectId('67a123456789012345678930'),
      brand: new Types.ObjectId('67a123456789012345678931'),
      category: 'image',
    });
    credentialsService.find.mockResolvedValue([
      {
        _id: new Types.ObjectId('67a123456789012345678932'),
        platform: 'linkedin',
      },
      {
        _id: new Types.ObjectId('67a123456789012345678933'),
        platform: 'twitter',
      },
    ]);

    const result = await service.executeTool(
      AgentToolName.CREATE_POST,
      {
        caption: 'Ship this now',
        contentId: '67a123456789012345678930',
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(result.creditsUsed).toBe(0);
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        contentId: '67a123456789012345678930',
        platforms: ['linkedin', 'twitter'],
        textContent: 'Ship this now',
        type: 'publish_post_card',
      }),
    ]);
  });

  it('returns a generic integrations card when connection status has no platform', async () => {
    const { credentialsService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.GET_CONNECTION_STATUS,
      {},
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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
            href: '/settings/organization/credentials?returnTo=%2Fagent',
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
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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
            href: '/settings/organization/credentials?returnTo=%2Fagent',
            label: 'Open integrations',
          }),
        ],
        title: 'Choose an integration',
        type: 'oauth_connect_card',
      }),
    ]);
  });

  it('lists ads research results and returns an ads card', async () => {
    const { adsResearchService, service } = createService();

    const result = await service.executeTool(
      'list_ads_research' as AgentToolName,
      {
        industry: 'fitness',
        platform: 'google',
        source: 'all',
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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

  it('creates an ad remix workflow and returns a workflow card', async () => {
    const { adsResearchService, service } = createService();

    const result = await service.executeTool(
      'create_ad_remix_workflow' as AgentToolName,
      {
        adId: 'public-ad-1',
        objective: 'Conversions',
        source: 'public',
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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
      'prepare_ad_launch_review' as AgentToolName,
      {
        adId: 'public-ad-1',
        createWorkflow: true,
        source: 'public',
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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

  it('publishes accessible content across connected platforms after confirmation', async () => {
    const { credentialsService, ingredientsService, postsService, service } =
      createService();

    ingredientsService.findOne.mockResolvedValue({
      _id: new Types.ObjectId('67a123456789012345678940'),
      brand: new Types.ObjectId('67a123456789012345678941'),
      category: 'video',
    });
    credentialsService.find.mockResolvedValue([
      {
        _id: new Types.ObjectId('67a123456789012345678942'),
        platform: 'linkedin',
      },
      {
        _id: new Types.ObjectId('67a123456789012345678943'),
        platform: 'youtube',
      },
    ]);
    postsService.create
      .mockResolvedValueOnce({
        _id: new Types.ObjectId('67a123456789012345678944'),
      })
      .mockResolvedValueOnce({
        _id: new Types.ObjectId('67a123456789012345678945'),
      });

    const result = await service.executeTool(
      AgentToolName.CREATE_POST,
      {
        caption: 'Published from chat',
        confirmed: true,
        contentId: '67a123456789012345678940',
        platforms: ['linkedin', 'youtube'],
      },
      {
        organizationId: '67a123456789012345678901',
        runId: '67a123456789012345678946',
        strategyId: '67a123456789012345678947',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(result.creditsUsed).toBe(0);
    expect(postsService.create).toHaveBeenCalledTimes(2);
    expect(postsService.handleYoutubePost).toHaveBeenCalledTimes(1);
    expect(result.data).toMatchObject({
      contentId: '67a123456789012345678940',
      createdPlatforms: ['linkedin', 'youtube'],
      totalCreated: 2,
    });
  });

  it('returns a post analytics snapshot for the latest related published post', async () => {
    const { ingredientsService, postAnalyticsService, postsService, service } =
      createService();

    ingredientsService.findOne.mockResolvedValue({
      _id: new Types.ObjectId('67a123456789012345678950'),
      brand: new Types.ObjectId('67a123456789012345678951'),
      category: 'image',
    });
    postsService.findAll.mockResolvedValue({
      docs: [{ _id: new Types.ObjectId('67a123456789012345678952') }],
    });

    const result = await service.executeTool(
      AgentToolName.GET_ANALYTICS,
      {
        contentId: '67a123456789012345678950',
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(result.creditsUsed).toBe(0);
    expect(postAnalyticsService.getPostAnalyticsSummary).toHaveBeenCalledWith(
      '67a123456789012345678952',
    );
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        title: 'Content analytics snapshot',
        type: 'analytics_snapshot_card',
      }),
    ]);
  });

  it('returns a no-analytics-yet response when content has no published post', async () => {
    const { credentialsService, ingredientsService, postsService, service } =
      createService();

    ingredientsService.findOne.mockResolvedValue({
      _id: new Types.ObjectId('67a123456789012345678960'),
      brand: new Types.ObjectId('67a123456789012345678961'),
      category: 'image',
    });
    credentialsService.find.mockResolvedValue([
      {
        _id: new Types.ObjectId('67a123456789012345678962'),
        platform: 'instagram',
      },
    ]);
    postsService.findAll.mockResolvedValue({ docs: [] });

    const result = await service.executeTool(
      AgentToolName.GET_ANALYTICS,
      {
        contentId: '67a123456789012345678960',
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(result.creditsUsed).toBe(0);
    expect(result.data).toMatchObject({
      contentId: '67a123456789012345678960',
      message:
        'This content does not have a published post yet, so analytics are not available.',
    });
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        contentId: '67a123456789012345678960',
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
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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
      'capture_memory' as AgentToolName,
      {
        brandId: '67a123456789012345678903',
        content: 'Use short, curiosity-driven newsletter openings.',
        contentType: 'newsletter',
        kind: 'winner',
        saveToContextMemory: true,
        scope: 'brand',
        summary: 'Short curiosity-driven newsletter openings',
        tags: ['newsletter', 'hook'],
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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

  it('should create a brand with onboarding defaults', async () => {
    const { brandsService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.CREATE_BRAND,
      {
        description: 'Creator focused fitness content',
        handle: '@fitcreator',
        name: 'Fit Creator',
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(brandsService.create).toHaveBeenCalled();
  });

  it('should return onboarding status for required setup milestones', async () => {
    const { postsService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.CHECK_ONBOARDING_STATUS,
      {},
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        completionPercent: expect.any(Number),
        earnedCredits: expect.any(Number),
        isComplete: expect.any(Boolean),
        journeyEarnedCredits: expect.any(Number),
        journeyRemainingCredits: expect.any(Number),
        missions: expect.any(Array),
        signupGiftCredits: expect.any(Number),
        totalOnboardingCreditsVisible: expect.any(Number),
      }),
    );
    expect(result.nextActions?.[0].type).toBe('onboarding_checklist_card');
    expect(postsService.findOne).toHaveBeenCalledWith(
      {
        isDeleted: false,
        organization: new Types.ObjectId('67a123456789012345678901'),
        status: PostStatus.PUBLIC,
      },
      [],
    );
  });

  it('should draft a brand voice profile card for the selected brand', async () => {
    const { brandsService, service } = createService();

    brandsService.findOne.mockResolvedValue({
      _id: 'brand-voice-1',
      label: 'Genfeed',
    });

    const result = await service.executeTool(
      DRAFT_BRAND_VOICE_PROFILE_TOOL,
      {
        examplesToAvoid: ['generic guru tone'],
        examplesToEmulate: ['April Dunford'],
        offering: 'AI workflow software for operators',
        targetAudience: 'startup operators',
        url: 'https://genfeed.ai',
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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
      '67a123456789012345678901',
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

  it('should persist an approved brand voice profile into brand agent config', async () => {
    const { brandsService, service } = createService();

    brandsService.findOne.mockResolvedValue({
      _id: 'brand-voice-1',
      label: 'Genfeed',
    });

    const result = await service.executeTool(
      SAVE_BRAND_VOICE_PROFILE_TOOL,
      {
        brandId: 'brand-voice-1',
        voiceProfile: {
          audience: ['founders', 'operators'],
          doNotSoundLike: ['buzzword-heavy'],
          hashtags: ['#genfeed'],
          messagingPillars: ['clarity', 'systems'],
          sampleOutput: 'Clear systems create compounding output.',
          style: 'direct',
          taglines: ['Ship with signal'],
          tone: 'confident',
          values: ['clarity', 'proof'],
        },
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(brandsService.updateAgentConfig).toHaveBeenCalledWith(
      'brand-voice-1',
      '67a123456789012345678901',
      {
        voice: {
          audience: ['founders', 'operators'],
          doNotSoundLike: ['buzzword-heavy'],
          hashtags: ['#genfeed'],
          messagingPillars: ['clarity', 'systems'],
          sampleOutput: 'Clear systems create compounding output.',
          style: 'direct',
          taglines: ['Ship with signal'],
          tone: 'confident',
          values: ['clarity', 'proof'],
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
      _id: 'post-1',
      status: PostStatus.PUBLIC,
    });

    const result = await service.executeTool(
      AgentToolName.CHECK_ONBOARDING_STATUS,
      {},
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(result.data?.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'publish_first_post',
          isCompleted: true,
          rewardClaimed: true,
        }),
      ]),
    );
    expect(result.nextActions?.[0]).toEqual(
      expect.objectContaining({
        checklist: expect.arrayContaining([
          expect.objectContaining({
            id: 'publish_first_post',
            isClaimed: true,
            isCompleted: true,
          }),
        ]),
        type: 'onboarding_checklist_card',
      }),
    );
    expect(organizationSettingsService.patch).toHaveBeenCalled();
    expect(
      creditsUtilsService.addOrganizationCreditsWithExpiration,
    ).toHaveBeenCalledWith(
      '67a123456789012345678901',
      30,
      'onboarding-journey',
      'Onboarding journey reward',
      expect.any(Date),
    );
  });

  it('should return ingredient_picker_card with empty library', async () => {
    const { service } = createService();

    const result = await service.executeTool(
      'select_ingredient' as AgentToolName,
      {},
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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
        _id: '507f191e810c19729de860ea',
        category: 'image',
        cdnUrl: 'https://cdn.genfeed.ai/images/test.jpg',
        metadata: { label: 'Test Image' },
      },
      {
        _id: '507f191e810c19729de860eb',
        category: 'video',
        cdnUrl: 'https://cdn.genfeed.ai/videos/test.mp4',
        metadata: null,
      },
    ]);

    const result = await service.executeTool(
      'select_ingredient' as AgentToolName,
      { mediaType: 'all' },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(result.data?.count).toBe(2);
    expect(result.nextActions).toHaveLength(1);
    expect(result.nextActions?.[0].type).toBe('ingredient_picker_card');
    expect(result.nextActions?.[0].ingredients).toHaveLength(2);
    expect(result.nextActions?.[0].ingredients?.[0]).toEqual(
      expect.objectContaining({
        id: '507f191e810c19729de860ea',
        title: 'Test Image',
        type: 'image',
        url: 'https://cdn.genfeed.ai/images/test.jpg',
      }),
    );
    expect(result.nextActions?.[0].ingredients?.[1]).toEqual(
      expect.objectContaining({
        id: '507f191e810c19729de860eb',
        type: 'video',
        url: 'https://cdn.genfeed.ai/videos/test.mp4',
      }),
    );
  });

  it('should filter by mediaType image only', async () => {
    const { imagesService, service } = createService();

    imagesService.findAllByOrganization.mockResolvedValue([
      {
        _id: '507f191e810c19729de860ec',
        category: 'image',
        cdnUrl: 'https://cdn.genfeed.ai/images/img.jpg',
        metadata: null,
      },
    ]);

    const result = await service.executeTool(
      'select_ingredient' as AgentToolName,
      { mediaType: 'image' },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(result.nextActions?.[0].ingredients?.[0].type).toBe('image');
    expect(imagesService.findAllByOrganization).toHaveBeenCalledWith(
      '67a123456789012345678901',
      expect.objectContaining({
        category: expect.objectContaining({ $in: ['image'] }),
      }),
      { createdAt: -1 },
      expect.any(Array),
    );
  });

  it('should complete onboarding and sync claims', async () => {
    const { clerkService, organizationsService, service, usersService } =
      createService();

    const result = await service.executeTool(
      AgentToolName.COMPLETE_ONBOARDING,
      {},
      {
        organizationId: '67a123456789012345678901',
        userId: 'user_clerk_123',
      },
    );

    expect(result.success).toBe(true);
    expect(organizationsService.patch).toHaveBeenCalled();
    expect(usersService.patch).toHaveBeenCalled();
    expect(clerkService.updateUserPublicMetadata).toHaveBeenCalledWith(
      'user_clerk_123',
      expect.objectContaining({
        isOnboardingCompleted: true,
      }),
    );
  });

  it('should return the current selected brand', async () => {
    const { brandsService, service } = createService();

    brandsService.findOne.mockResolvedValue({
      _id: '67a1234567890123456789aa',
      description: 'Brand description',
      handle: 'genfeed',
      isActive: true,
      label: 'Genfeed',
      text: 'Publish content. Now.',
    });

    const result = await service.executeTool(
      AgentToolName.GET_CURRENT_BRAND,
      {},
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        currentBrand: expect.objectContaining({
          description: 'Brand description',
          handle: 'genfeed',
          id: '67a1234567890123456789aa',
          isActive: true,
          label: 'Genfeed',
          text: 'Publish content. Now.',
        }),
      }),
    );
    expect(brandsService.findOne).toHaveBeenCalledWith({
      isDeleted: false,
      isSelected: true,
      organization: expect.any(Types.ObjectId),
      user: expect.any(Types.ObjectId),
    });
  });

  it('should return an error when no selected brand exists', async () => {
    const { brandsService, service } = createService();

    brandsService.findOne.mockResolvedValue(null);

    const result = await service.executeTool(
      AgentToolName.GET_CURRENT_BRAND,
      {},
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No brand is currently selected');
  });

  it('should use the selected brand when batch generation omits brandId', async () => {
    const { batchGenerationService, brandsService, service } = createService();

    brandsService.findOne.mockResolvedValue({
      _id: '67a1234567890123456789aa',
      description: 'Brand description',
      handle: 'genfeed',
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
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(batchGenerationService.createBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: '67a1234567890123456789aa',
        count: 20,
        platforms: ['instagram', 'twitter', 'linkedin'],
        topics: ['AI content creation'],
      }),
      '67a123456789012345678902',
      '67a123456789012345678901',
    );
    expect(brandsService.findOne).toHaveBeenCalledWith({
      isDeleted: false,
      isSelected: true,
      organization: expect.any(Types.ObjectId),
      user: expect.any(Types.ObjectId),
    });
  });

  it('seeds async batch item processes into the live agent thread', async () => {
    const { batchGenerationService, brandsService, service, streamPublisher } =
      createService();

    brandsService.findOne.mockResolvedValue({
      _id: '67a1234567890123456789aa',
      description: 'Brand description',
      handle: 'genfeed',
      isActive: true,
      isSelected: true,
      label: 'Genfeed',
      text: 'Publish content. Now.',
    });

    let capturedOptions:
      | Parameters<typeof batchGenerationService.processBatch>[2]
      | undefined;

    batchGenerationService.processBatch.mockImplementation(
      async (_batchId, _orgId, options) => {
        capturedOptions = options;
        return undefined as never;
      },
    );

    const result = await service.executeTool(
      AgentToolName.GENERATE_CONTENT_BATCH,
      {
        count: 2,
        platforms: ['instagram'],
        topics: ['launch day'],
      },
      {
        organizationId: '67a123456789012345678901',
        runId: 'run-1',
        threadId: 'thread-1',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(batchGenerationService.processBatch).toHaveBeenCalledWith(
      '67a1234567890123456789ba',
      '67a123456789012345678901',
      expect.any(Object),
    );
    expect(capturedOptions).toBeDefined();

    const itemId = new Types.ObjectId('67a1234567890123456789bb');

    await capturedOptions?.onBatchStarted?.({
      batchId: '67a1234567890123456789ba',
      totalCount: 2,
    });
    await capturedOptions?.onItemStarted?.({
      batchId: '67a1234567890123456789ba',
      completedCount: 0,
      failedCount: 0,
      index: 0,
      item: {
        _id: itemId,
        format: 'image',
        platform: 'instagram',
        status: 'generating',
      } as never,
      topic: 'launch day',
      totalCount: 2,
    });
    await capturedOptions?.onItemCompleted?.({
      batchId: '67a1234567890123456789ba',
      completedCount: 1,
      failedCount: 0,
      index: 0,
      item: {
        _id: itemId,
        format: 'image',
        platform: 'instagram',
        status: 'completed',
      } as never,
      postId: 'post-1',
      previewText: 'Draft ready',
      topic: 'launch day',
      totalCount: 2,
    });

    expect(streamPublisher.publishWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Batch generation started',
        toolCallId: 'batch:67a1234567890123456789ba',
        toolName: AgentToolName.GENERATE_CONTENT_BATCH,
      }),
    );
    expect(streamPublisher.publishWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Generating post 1',
        toolCallId:
          'batch:67a1234567890123456789ba:item:67a1234567890123456789bb',
        toolName: AgentToolName.GENERATE_CONTENT_BATCH,
      }),
    );
    expect(streamPublisher.publishWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Generated post 1',
        toolCallId:
          'batch:67a1234567890123456789ba:item:67a1234567890123456789bb',
        toolName: AgentToolName.GENERATE_CONTENT_BATCH,
      }),
    );
  });

  it('should return clip_workflow_run_card from prepare_clip_workflow_run', async () => {
    const { service, workflowsService } = createService();

    workflowsService.findAll.mockResolvedValue({
      docs: [
        {
          _id: '507f191e810c19729de860ff',
          description: 'Main clip workflow',
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
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(result.nextActions).toHaveLength(1);
    expect(result.nextActions?.[0].type).toBe('clip_workflow_run_card');
    expect(result.nextActions?.[0].workflowId).toBe('507f191e810c19729de860ff');
    expect(result.nextActions?.[0].clipRun).toEqual(
      expect.objectContaining({
        durationSeconds: 30,
        format: 'landscape',
        mergeGeneratedVideos: true,
      }),
    );
  });

  it('should sanitize colon-prefixed batch ids for list_review_queue and return a conversation card', async () => {
    const { batchGenerationService, service } = createService();
    batchGenerationService.getBatch = vi.fn().mockResolvedValue({
      id: '69c2d469368c4314a3cfff32',
      items: [
        {
          _id: '69c2d469368c4314a3cfff40',
          format: 'image',
          platform: 'instagram',
          reviewDecision: undefined,
          status: 'pending',
        },
        {
          _id: '69c2d469368c4314a3cfff41',
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
        batchId: ':69c2d469368c4314a3cfff32',
        limit: 25,
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(batchGenerationService.getBatch).toHaveBeenCalledWith(
      '69c2d469368c4314a3cfff32',
      '67a123456789012345678901',
    );
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        id: 'review-queue-69c2d469368c4314a3cfff32',
        outcomeBullets: [
          'Instagram · image · pending',
          'Linkedin · image · approved',
        ],
        primaryCta: {
          href: '/posts/review?batch=69c2d469368c4314a3cfff32&filter=ready',
          label: 'Open review queue',
        },
        status: 'completed',
        summaryText:
          'Loaded 2 items from this batch. 1 item is ready for review right now.',
        title: 'Review queue loaded',
        type: 'completion_summary_card',
      }),
    ]);
  });

  it('should create a workflow-backed recurring automation via create_workflow', async () => {
    const { brandsService, recurringWorkflowId, service, workflowsService } =
      createService();

    brandsService.findOne.mockResolvedValue({
      _id: '67a1234567890123456789aa',
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
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      '67a123456789012345678902',
      '67a123456789012345678901',
      expect.objectContaining({
        brands: [expect.any(Types.ObjectId)],
        isScheduleEnabled: true,
        nodes: [
          expect.objectContaining({
            type: 'ai-generate-image',
          }),
        ],
        schedule: '0 17 * * *',
        timezone: 'Europe/Malta',
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        brandId: '67a1234567890123456789aa',
        editorUrl: `/automations/editor/${recurringWorkflowId}`,
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
        _id: 'trend-1',
        platform: 'tiktok',
        score: 91.2,
        topic: 'Founder confession hooks',
      },
      {
        _id: 'trend-2',
        platform: 'tiktok',
        score: 77.8,
        topic: 'Behind-the-scenes product build',
      },
    ]);

    const result = await service.executeTool(
      AgentToolName.GET_TRENDS,
      { platform: 'tiktok' },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(trendsService.getTrends).toHaveBeenCalledWith(
      '67a123456789012345678901',
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

  it('should retry get_trends with live fetch when the cached corpus is empty', async () => {
    const { service, trendsService } = createService();

    trendsService.getTrends.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        _id: 'trend-3',
        platform: 'youtube',
        score: 88.4,
        topic: 'Creator teardown format',
      },
    ]);

    const result = await service.executeTool(
      AgentToolName.GET_TRENDS,
      { platform: 'youtube' },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(trendsService.getTrends).toHaveBeenNthCalledWith(
      1,
      '67a123456789012345678901',
      undefined,
      'youtube',
      { allowFetchIfMissing: false },
    );
    expect(trendsService.getTrends).toHaveBeenNthCalledWith(
      2,
      '67a123456789012345678901',
      undefined,
      'youtube',
      { allowFetchIfMissing: true },
    );
    expect(result.data).toEqual({
      count: 1,
      trends: [
        {
          id: 'trend-3',
          platform: 'youtube',
          score: 88.4,
          topic: 'Creator teardown format',
        },
      ],
    });
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^trends-youtube-/),
        outcomeBullets: ['Creator teardown format · score 88'],
        summaryText:
          'Loaded 1 YouTube trend from the cached corpus. Open trends analytics to review the strongest hooks and decide what to remix.',
        title: 'YouTube trends loaded',
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
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(trendsService.getTrends).toHaveBeenNthCalledWith(
      1,
      '67a123456789012345678901',
      undefined,
      'tiktok',
      { allowFetchIfMissing: false },
    );
    expect(trendsService.getTrends).toHaveBeenNthCalledWith(
      2,
      '67a123456789012345678901',
      undefined,
      'tiktok',
      { allowFetchIfMissing: true },
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
    const { brandsService, recurringWorkflowId, service, workflowsService } =
      createService();

    brandsService.findOne.mockResolvedValue({
      _id: '67a1234567890123456789aa',
      isSelected: true,
      label: 'Genfeed',
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
                prompt: 'Plan next week of content',
              },
              label: 'Plan Content',
            },
            id: 'plan',
            position: { x: 120, y: 120 },
            type: 'ai-generate-post',
          },
          {
            data: {
              config: {
                prompt: 'Draft the strongest option',
              },
              label: 'Draft Content',
            },
            id: 'draft',
            position: { x: 420, y: 120 },
            type: 'ai-generate-post',
          },
        ],
        schedule: '0 9 * * 1',
        timezone: 'Europe/Malta',
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      '67a123456789012345678902',
      '67a123456789012345678901',
      expect.objectContaining({
        brands: [expect.any(Types.ObjectId)],
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
        editorUrl: `/automations/editor/${recurringWorkflowId}`,
        label: 'Weekly Content Planner',
        nextRunAt: expect.any(Date),
        schedule: '0 9 * * 1',
        timezone: 'Europe/Malta',
      }),
    );
    expect(result.nextActions?.[0]).toEqual(
      expect.objectContaining({
        type: 'workflow_created_card',
        workflowId: recurringWorkflowId,
        workflowName: 'Weekly Content Planner',
      }),
    );
  });

  it('should create a workflow-backed recurring post automation', async () => {
    const { brandsService, service, workflowsService } = createService();

    brandsService.findOne.mockResolvedValue({
      _id: '67a1234567890123456789aa',
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
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      '67a123456789012345678902',
      '67a123456789012345678901',
      expect.objectContaining({
        nodes: [
          expect.objectContaining({
            data: expect.objectContaining({
              config: expect.objectContaining({
                brandId: '67a1234567890123456789aa',
                brandLabel: 'Genfeed',
                prompt: 'Create one daily post draft about product learnings',
              }),
            }),
            type: 'ai-generate-post',
          }),
        ],
      }),
    );
  });

  it('should create a workflow-backed recurring newsletter automation', async () => {
    const { brandsService, service, workflowsService } = createService();

    brandsService.findOne.mockResolvedValue({
      _id: '67a1234567890123456789aa',
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
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      '67a123456789012345678902',
      '67a123456789012345678901',
      expect.objectContaining({
        nodes: [
          expect.objectContaining({
            data: expect.objectContaining({
              config: expect.objectContaining({
                brandId: '67a1234567890123456789aa',
                brandLabel: 'Genfeed',
                instructions: 'Keep the issue practical and operator-focused.',
                prompt: 'Draft the next daily newsletter issue',
              }),
            }),
            type: 'ai-generate-newsletter',
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
      _id: '67a1234567890123456789aa',
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
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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
    expect(userId).toBe('67a123456789012345678902');
    expect(organizationId).toBe('67a123456789012345678901');
    expect(
      workflowPayload.brands.map((brand: { toString(): string }) =>
        brand.toString(),
      ),
    ).toEqual(['67a1234567890123456789aa']);
    expect(workflowPayload.description).toBe('Generated workflow description');
    expect(workflowPayload.edges[0]?.id).toBe('edge-1');
    expect(workflowPayload.isScheduleEnabled).toBe(true);
    expect(workflowPayload.label).toBe('Generated Workflow');
    expect(workflowPayload.metadata).toMatchObject({
      brandId: '67a1234567890123456789aa',
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
        editorUrl: `/automations/editor/${recurringWorkflowId}`,
        label: 'Generated Workflow',
      }),
    );
  });

  it('should fall back to Clerk metadata brand when selected brand is missing', async () => {
    const {
      brandsService,
      clerkService,
      recurringWorkflowId,
      service,
      usersService,
      workflowsService,
    } = createService();

    brandsService.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      _id: '67a1234567890123456789ab',
      label: 'Fallback Brand',
    });
    usersService.findOne.mockResolvedValue({
      _id: '67a123456789012345678902',
      clerkId: 'clerk_abc123',
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
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(clerkService.getUser).toHaveBeenCalledWith('clerk_abc123');
    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      '67a123456789012345678902',
      '67a123456789012345678901',
      expect.objectContaining({
        brands: [expect.any(Types.ObjectId)],
      }),
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        brandId: '67a1234567890123456789ab',
        editorUrl: `/automations/editor/${recurringWorkflowId}`,
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
      _id: '67a1234567890123456789aa',
      isSelected: true,
      label: 'Genfeed',
    });

    const result = await service.executeTool(
      CREATE_LIVESTREAM_BOT_TOOL,
      {
        channelId: 'UC123456789',
        label: 'Launch Live Bot',
        linkUrl: 'https://genfeed.ai/show-notes',
        platform: 'youtube',
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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
      _id: '67a1234567890123456789aa',
      isSelected: true,
      label: 'Genfeed',
    });

    const result = await service.executeTool(
      CREATE_LIVESTREAM_BOT_TOOL,
      {
        channelId: 'genfeed-live',
        label: 'Twitch Chat Bot',
        platform: 'twitch',
        senderId: 'sender-42',
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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
      _id: '67a1234567890123456789aa',
      isSelected: true,
      label: 'Genfeed',
    });

    const result = await service.executeTool(
      MANAGE_LIVESTREAM_BOT_TOOL,
      {
        action: 'start_session',
        botId: livestreamBotId,
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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
      _id: '67a1234567890123456789aa',
      isSelected: true,
      label: 'Genfeed',
    });

    const result = await service.executeTool(
      MANAGE_LIVESTREAM_BOT_TOOL,
      {
        action: 'send_now',
        botId: livestreamBotId,
        message: 'Ship it',
        platform: 'youtube',
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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
      _id: '67a1234567890123456789ab',
      isSelected: true,
      label: 'Other Brand',
    });
    botsService.findOne.mockResolvedValue({
      _id: new Types.ObjectId(livestreamBotId),
      brand: new Types.ObjectId('67a1234567890123456789aa'),
      category: 'livestream_chat',
      label: 'Launch Live Bot',
      livestreamSettings: { automaticPosting: true },
      organization: new Types.ObjectId('67a123456789012345678901'),
      platforms: ['youtube'],
      targets: [
        {
          channelId: 'UC-live-1',
          isEnabled: true,
          platform: 'youtube',
        },
      ],
      user: new Types.ObjectId('67a123456789012345678902'),
    });

    const result = await service.executeTool(
      MANAGE_LIVESTREAM_BOT_TOOL,
      {
        action: 'start_session',
        botId: livestreamBotId,
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'Livestream bot not found for the current organization and brand.',
    );
  });

  it('should gracefully fallback when generate_image endpoint fails', async () => {
    const { loggerService, service } = createService();

    vi.spyOn(
      service as unknown as {
        callInternalApi: (...args: unknown[]) => Promise<unknown>;
      },
      'callInternalApi',
    ).mockRejectedValue(new Error('timeout'));

    const result = await service.executeTool(
      AgentToolName.GENERATE_IMAGE,
      { prompt: 'podcast host portrait' },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        status: expect.any(String),
      }),
    );
    expect(result.nextActions?.[0].type).toBe('content_preview_card');
    expect(loggerService.warn).toHaveBeenCalled();
  });

  it('should normalize generate_image prompt from description when prompt is missing', async () => {
    const { service } = createService();

    const callInternalApiSpy = vi
      .spyOn(
        service as unknown as {
          callInternalApi: (...args: unknown[]) => Promise<unknown>;
        },
        'callInternalApi',
      )
      .mockResolvedValue({
        data: { id: 'img-123' },
      });

    const result = await service.executeTool(
      AgentToolName.GENERATE_IMAGE,
      { description: 'podcast host portrait' },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(callInternalApiSpy).toHaveBeenCalledWith(
      'POST',
      '/v1/images',
      expect.objectContaining({
        prompt: 'podcast host portrait',
        text: 'podcast host portrait',
      }),
      expect.any(Object),
    );
  });

  it('should map hashtags ai_action alias to add-hashtags DTO action', async () => {
    const { aiActionsService, service } = createService();

    const result = await service.executeTool(
      AgentToolName.AI_ACTION,
      { action: 'hashtags', text: 'launch post copy' },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(aiActionsService.execute).toHaveBeenCalledWith(
      '67a123456789012345678901',
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
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(aiActionsService.execute).toHaveBeenCalledWith(
      '67a123456789012345678901',
      expect.objectContaining({
        action: AiActionType.ENHANCE_PROMPT,
        content: 'improve this',
      }),
    );
  });

  it('should execute rate_content successfully', async () => {
    const { contentQualityScorerService, service } = createService();

    const result = await service.executeTool(
      'rate_content' as AgentToolName,
      {
        contentId: '507f191e810c19729de860ea',
        contentType: 'image',
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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
      '507f191e810c19729de860ea',
      'image',
      undefined,
      '67a123456789012345678901',
    );
  });

  it('should fail rate_content when contentId is missing', async () => {
    const { contentQualityScorerService, service } = createService();

    const result = await service.executeTool(
      'rate_content' as AgentToolName,
      { contentType: 'image' },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('contentId is required');
    expect(contentQualityScorerService.scoreContent).not.toHaveBeenCalled();
  });

  it('should fail rate_content when scorer service is unavailable', async () => {
    const {
      aiActionsService,
      brandsService,
      clerkService,
      credentialsService,
      imagesService,
      loggerService,
      organizationsService,
      postsService,
      usersService,
      workflowsService,
    } = createService();

    const serviceWithoutScorer = new AgentToolExecutorService(
      loggerService,
      { get: vi.fn().mockReturnValue('http://localhost:3001') } as never,
      {} as never,
      postsService as never,
      brandsService as never,
      {} as never,
      {} as never,
      {} as never,
      { findOne: vi.fn() } as never,
      workflowsService as never,
      undefined as never,
      undefined as never,
      undefined as never,
      {} as never,
      {} as never,
      aiActionsService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      credentialsService as never,
      organizationsService as never,
      { findOne: vi.fn().mockResolvedValue({}) } as never,
      { findOne: vi.fn().mockResolvedValue({}) } as never,
      usersService as never,
      clerkService as never,
      undefined as never,
      undefined as never,
      imagesService as never,
      { findAll: vi.fn().mockResolvedValue({ docs: [] }) } as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );

    const result = await serviceWithoutScorer.executeTool(
      'rate_content' as AgentToolName,
      { contentId: '507f191e810c19729de860ea' },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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
      'install_official_workflow' as AgentToolName,
      {
        contentType: 'video',
        prompt: 'Set me up with a social media video series for LinkedIn',
        schedule: '0 9 * * 1',
        timezone: 'Europe/Malta',
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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

  it('installs the confirmed official seeded template into automations', async () => {
    const { service, workflowsService } = createService();

    workflowsService.findOne.mockResolvedValue({
      _id: 'wf-official-1',
      brands: [],
      isDeleted: false,
      label: 'Social Media Video Series',
      metadata: {},
      organization: new Types.ObjectId('67a123456789012345678901'),
    });

    const result = await service.executeTool(
      'install_official_workflow' as AgentToolName,
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
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      '67a123456789012345678902',
      '67a123456789012345678901',
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
      editorUrl: `/automations/editor/${result.data?.id}`,
      installedFrom: 'seeded-template',
    });
    expect(result.nextActions?.[0]?.ctas?.[0]).toMatchObject({
      href: `/automations/editor/${result.data?.id}`,
      label: 'Open workflow',
    });
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
      _id: '67a1234567890123456789aa',
      agentConfig: {
        defaultVoiceId: new Types.ObjectId('67a1234567890123456789dd'),
      },
      isSelected: true,
      label: 'Genfeed',
    });
    organizationSettingsService.findOne.mockResolvedValue({
      _id: 'settings-1',
      defaultVoiceId: new Types.ObjectId('67a1234567890123456789ee'),
      onboardingJourneyMissions: [],
    });
    voicesService.findAll.mockResolvedValue({
      docs: [
        {
          _id: new Types.ObjectId('67a1234567890123456789ff'),
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
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(result.nextActions?.[0]).toMatchObject({
      id: 'voice-clone-1700000000000',
      recommendedVoiceId: '67a1234567890123456789dd',
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
      _id: '67a1234567890123456789aa',
      agentConfig: {},
      isSelected: true,
      label: 'Genfeed',
    });
    organizationSettingsService.findOne.mockResolvedValue({
      _id: 'settings-1',
      defaultVoiceId: new Types.ObjectId('67a1234567890123456789ee'),
      onboardingJourneyMissions: [],
    });
    voicesService.findAll.mockResolvedValue({
      docs: [
        {
          _id: new Types.ObjectId('67a1234567890123456789ff'),
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
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(result.nextActions?.[0]).toMatchObject({
      recommendedVoiceId: '67a1234567890123456789ee',
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
      _id: '67a1234567890123456789aa',
      agentConfig: {},
      isSelected: true,
      label: 'Genfeed',
    });
    organizationSettingsService.findOne.mockResolvedValue({
      _id: 'settings-1',
      onboardingJourneyMissions: [],
    });
    voicesService.findAll.mockResolvedValue({
      docs: [
        {
          _id: new Types.ObjectId('67a1234567890123456789ab'),
          cloneStatus: 'processing',
          metadataLabel: 'Still Processing',
          provider: 'elevenlabs',
        },
        {
          _id: new Types.ObjectId('67a1234567890123456789ff'),
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
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
      },
    );

    expect(result.success).toBe(true);
    expect(result.nextActions?.[0]).toMatchObject({
      recommendedVoiceId: '67a1234567890123456789ff',
      type: 'voice_clone_card',
    });
  });

  it('returns purchase CTA only for paid official marketplace workflows', async () => {
    const { service, listingsService, purchasesService } = createService();

    listingsService.findOne.mockResolvedValue({
      _id: 'listing-1',
      isDeleted: false,
      price: 49,
      pricingTier: 'premium',
      slug: 'official-linkedin-workflow',
    });
    purchasesService.checkListingOwnership.mockResolvedValue({
      owned: false,
      purchase: null,
    });

    const result = await service.executeTool(
      'install_official_workflow' as AgentToolName,
      {
        confirmed: true,
        prompt: 'Install the official LinkedIn workflow',
        sourceDescription: 'Official LinkedIn workflow',
        sourceId: 'listing-1',
        sourceName: 'Official LinkedIn Workflow',
        sourceSlug: 'official-linkedin-workflow',
        sourceType: 'marketplace-listing',
      },
      {
        organizationId: '67a123456789012345678901',
        userId: '67a123456789012345678902',
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
    organizationId: '67a123456789012345678901',
    userId: '67a123456789012345678902',
  };

  it('list_workflows returns workflows from the org', async () => {
    const { service, workflowsService } = createService();

    workflowsService.findAll.mockResolvedValue({
      docs: [
        {
          _id: new Types.ObjectId('507f191e810c19729de860ea'),
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
        id: '507f191e810c19729de860ea',
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

  it('execute_workflow triggers workflow and returns execution id', async () => {
    const { service, workflowsService, workflowExecutorService } =
      createService();

    workflowsService.findOne.mockResolvedValue({
      _id: 'wf-1',
      inputVariables: [],
      isDeleted: false,
      organization: CTX.organizationId,
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
      _id: 'wf-2',
      inputVariables: [
        { key: 'topic', label: 'Topic', required: true, type: 'text' },
        { key: 'style', label: 'Style', required: false, type: 'select' },
      ],
      isDeleted: false,
      organization: CTX.organizationId,
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
      _id: 'wf-2',
      inputVariables: [
        { key: 'topic', label: 'Topic', required: true, type: 'text' },
      ],
      isDeleted: false,
      organization: CTX.organizationId,
    });

    const result = await service.executeTool(
      AgentToolName.EXECUTE_WORKFLOW,
      { inputs: { topic: 'AI trends' }, workflowId: 'wf-2' },
      CTX,
    );

    expect(result.success).toBe(true);
  });

  it('get_workflow_inputs returns input variable definitions', async () => {
    const { service, workflowsService } = createService();

    workflowsService.findOne.mockResolvedValue({
      _id: 'wf-3',
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
      'get_workflow_inputs' as AgentToolName,
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
      'get_workflow_inputs' as AgentToolName,
      { workflowId: 'missing' },
      CTX,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});
