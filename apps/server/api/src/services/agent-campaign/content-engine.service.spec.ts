import { AnalyticsMetric } from '@genfeedai/enums';
import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { ContentEngineService } from './content-engine.service';

describe('ContentEngineService', () => {
  const campaignId = new Types.ObjectId().toHexString();
  const organizationId = new Types.ObjectId().toHexString();
  const userId = new Types.ObjectId().toHexString();
  const brandId = new Types.ObjectId().toHexString();

  function createCampaign(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      _id: new Types.ObjectId(campaignId),
      agents: [],
      brand: new Types.ObjectId(brandId),
      brief: 'React to signal changes',
      creditsAllocated: 100,
      creditsUsed: 20,
      label: 'Spring Push',
      orchestrationEnabled: true,
      orchestrationIntervalHours: 6,
      organization: new Types.ObjectId(organizationId),
      status: 'active',
      user: new Types.ObjectId(userId),
      ...overrides,
    };
  }

  function createStrategy(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      _id: new Types.ObjectId(),
      agentType: 'general',
      autonomyMode: 'supervised',
      dailyCreditBudget: 25,
      displayRole: 'Engagement responder',
      isEnabled: true,
      label: 'Engagement responder',
      model: 'openrouter/auto',
      platforms: ['twitter'],
      topics: ['ai marketing'],
      ...overrides,
    };
  }

  function createService() {
    const agentCampaignsService = {
      findOne: vi.fn(),
      findOneById: vi.fn(),
      patch: vi.fn(),
    };
    const agentStrategiesService = {
      findOneById: vi.fn(),
    };
    const agentGoalsService = {
      getGoalSummary: vi.fn(),
    };
    const agentRunsService = {
      create: vi.fn(),
      mergeMetadata: vi.fn(),
      patch: vi.fn(),
    };
    const agentRunQueueService = {
      queueRun: vi.fn(),
    };
    const analyticsService = {
      getOverview: vi.fn(),
      getTopContent: vi.fn(),
    };
    const agentMemoryCaptureService = {
      capture: vi.fn(),
    };
    const campaignMemoryQueueService = {
      queueExtraction: vi.fn(),
    };
    const orchestratorQueueService = {
      queueCampaignRun: vi.fn(),
    };
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    return {
      agentCampaignsService,
      agentGoalsService,
      agentMemoryCaptureService,
      agentRunQueueService,
      agentRunsService,
      agentStrategiesService,
      analyticsService,
      campaignMemoryQueueService,
      logger,
      orchestratorQueueService,
      service: new ContentEngineService(
        agentCampaignsService as never,
        agentStrategiesService as never,
        agentGoalsService as never,
        agentRunsService as never,
        agentRunQueueService as never,
        analyticsService as never,
        agentMemoryCaptureService as never,
        campaignMemoryQueueService as never,
        orchestratorQueueService as never,
        logger as never,
      ),
    };
  }

  it('runOrchestrationCycle finalizes a skipped cycle when the campaign is not active', async () => {
    const {
      agentCampaignsService,
      agentRunQueueService,
      agentRunsService,
      service,
    } = createService();

    agentCampaignsService.findOne.mockResolvedValue(
      createCampaign({ status: 'paused' }),
    );
    agentCampaignsService.patch.mockResolvedValue(undefined);

    const result = await service.runOrchestrationCycle(
      campaignId,
      organizationId,
    );

    expect(result).toMatchObject({
      campaignId,
      dispatchCount: 0,
      skippedReason: 'Campaign is paused, skipping orchestration.',
    });
    expect(agentCampaignsService.patch).toHaveBeenCalledWith(
      campaignId,
      expect.objectContaining({
        lastOrchestrationSummary:
          'Skipped orchestration because campaign status is paused.',
        nextOrchestratedAt: null,
      }),
    );
    expect(agentRunsService.create).not.toHaveBeenCalled();
    expect(agentRunQueueService.queueRun).not.toHaveBeenCalled();
  });

  it('runOrchestrationCycle completes the campaign when the remaining credit budget is exhausted', async () => {
    const {
      agentCampaignsService,
      agentGoalsService,
      agentRunQueueService,
      agentStrategiesService,
      analyticsService,
      service,
    } = createService();
    const strategy = createStrategy();
    const campaign = createCampaign({
      agents: [strategy._id],
      creditsAllocated: 10,
      creditsUsed: 10,
    });

    agentCampaignsService.findOne.mockResolvedValue(campaign);
    agentCampaignsService.patch.mockResolvedValue(undefined);
    agentStrategiesService.findOneById.mockResolvedValue(strategy);
    agentGoalsService.getGoalSummary.mockResolvedValue('Increase engagement');
    analyticsService.getOverview.mockResolvedValue({
      avgEngagementRate: 4.2,
      totalPosts: 3,
      totalViews: 120,
    });

    const result = await service.runOrchestrationCycle(
      campaignId,
      organizationId,
    );

    expect(result).toMatchObject({
      campaignId,
      dispatchCount: 0,
      skippedReason: 'Campaign credit budget is exhausted.',
    });
    expect(agentCampaignsService.patch).toHaveBeenNthCalledWith(
      1,
      campaignId,
      expect.objectContaining({
        lastOrchestrationSummary:
          'Campaign budget exhausted before orchestration dispatch.',
        nextOrchestratedAt: null,
        status: 'completed',
      }),
    );
    expect(agentCampaignsService.patch).toHaveBeenNthCalledWith(
      2,
      campaignId,
      expect.objectContaining({
        lastOrchestrationSummary:
          'Skipped orchestration and completed the campaign because the credit budget is exhausted.',
        nextOrchestratedAt: null,
      }),
    );
    expect(agentRunQueueService.queueRun).not.toHaveBeenCalled();
  });

  it('runOrchestrationCycle dispatches eligible specialist strategies and captures decision memory', async () => {
    const {
      agentCampaignsService,
      agentGoalsService,
      agentMemoryCaptureService,
      agentRunQueueService,
      agentRunsService,
      agentStrategiesService,
      analyticsService,
      service,
    } = createService();
    const strategy = createStrategy({
      dailyCreditBudget: 24,
      goalId: new Types.ObjectId(),
      topics: ['ai marketing', 'creator growth'],
    });
    const runId = new Types.ObjectId().toHexString();
    const campaign = createCampaign({ agents: [strategy._id] });

    agentCampaignsService.findOne.mockResolvedValue(campaign);
    agentCampaignsService.patch.mockResolvedValue(undefined);
    agentStrategiesService.findOneById.mockResolvedValue(strategy);
    agentGoalsService.getGoalSummary.mockResolvedValue(
      'Increase qualified engagement',
    );
    analyticsService.getOverview.mockResolvedValue({
      avgEngagementRate: 7.2,
      totalPosts: 4,
      totalViews: 3200,
    });
    agentRunsService.create.mockResolvedValue({
      _id: new Types.ObjectId(runId),
      metadata: { existing: true },
    });
    agentRunsService.mergeMetadata.mockResolvedValue(undefined);
    agentRunsService.patch.mockResolvedValue(undefined);
    agentRunQueueService.queueRun.mockResolvedValue(undefined);
    agentMemoryCaptureService.capture.mockResolvedValue({
      memory: { _id: new Types.ObjectId() },
      wroteBrandInsight: false,
      wroteContextMemory: true,
    });

    const result = await service.runOrchestrationCycle(
      campaignId,
      organizationId,
    );

    expect(result.dispatchCount).toBe(1);
    expect(result.summary).toContain(
      'Campaign Spring Push dispatched 1 specialist run(s).',
    );
    expect(result.nextOrchestratedAt).toBeInstanceOf(Date);
    expect(agentRunQueueService.queueRun).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId,
        creditBudget: 24,
        organizationId,
        runId,
        strategyId: String(strategy._id),
        userId,
      }),
    );
    expect(agentMemoryCaptureService.capture).toHaveBeenCalledWith(
      userId,
      organizationId,
      expect.objectContaining({
        campaignId,
        scope: 'campaign',
        sourceType: 'campaign-orchestrator',
      }),
    );
    expect(agentRunsService.patch).toHaveBeenCalledWith(
      runId,
      expect.objectContaining({
        metadata: expect.objectContaining({
          campaignId,
          orchestrationSummary: expect.stringContaining('specialist run'),
        }),
      }),
    );
  });

  it('extractWinnerPatterns stores a campaign-scoped winner memory', async () => {
    const {
      agentCampaignsService,
      agentMemoryCaptureService,
      analyticsService,
      service,
    } = createService();
    agentCampaignsService.findOne.mockResolvedValue({
      _id: new Types.ObjectId(campaignId),
      brand: new Types.ObjectId(brandId),
      label: 'Spring Push',
      organization: new Types.ObjectId(organizationId),
      status: 'active',
      user: new Types.ObjectId(userId),
    });
    analyticsService.getTopContent.mockResolvedValue([
      {
        date: '2026-03-30T09:00:00.000Z',
        description: 'How to turn one idea into five posts',
        engagementRate: 7.2,
        isVideo: true,
        label: 'Repurpose once',
        platform: 'tiktok',
        totalViews: 1200,
      },
      {
        date: '2026-03-29T10:00:00.000Z',
        description: 'How to make your hook clearer',
        engagementRate: 8.1,
        isVideo: true,
        label: 'Clearer hook',
        platform: 'tiktok',
        totalViews: 2200,
      },
    ]);
    agentMemoryCaptureService.capture.mockResolvedValue({
      memory: { _id: new Types.ObjectId() },
      wroteBrandInsight: false,
      wroteContextMemory: false,
    });

    const result = await service.extractWinnerPatterns(
      campaignId,
      organizationId,
    );

    expect(analyticsService.getTopContent).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      5,
      AnalyticsMetric.ENGAGEMENT,
      brandId,
      undefined,
      organizationId,
    );
    expect(agentMemoryCaptureService.capture).toHaveBeenCalledWith(
      userId,
      organizationId,
      expect.objectContaining({
        campaignId,
        contentType: 'post',
        kind: 'winner',
        scope: 'campaign',
        sourceType: 'campaign-winner-extraction',
      }),
    );
    expect(result.extractedCount).toBe(2);
    expect(result.summary).toContain('video');
    expect(result.summary).toContain('tiktok');
  });

  it('scheduleCampaign queues both orchestration and memory extraction jobs', async () => {
    const { campaignMemoryQueueService, orchestratorQueueService, service } =
      createService();
    orchestratorQueueService.queueCampaignRun.mockResolvedValue('job-1');
    campaignMemoryQueueService.queueExtraction.mockResolvedValue('job-2');

    const result = await service.scheduleCampaign(
      campaignId,
      organizationId,
      userId,
    );

    expect(orchestratorQueueService.queueCampaignRun).toHaveBeenCalledWith({
      campaignId,
      organizationId,
      userId,
    });
    expect(campaignMemoryQueueService.queueExtraction).toHaveBeenCalledWith({
      campaignId,
      organizationId,
      userId,
    });
    expect(result).toBe('job-1');
  });

  it('dispatchTriggeredRuns skips when the campaign is not active', async () => {
    const { agentCampaignsService, agentRunsService, service } =
      createService();

    agentCampaignsService.findOneById.mockResolvedValue(
      createCampaign({
        nextOrchestratedAt: new Date('2026-04-01T12:00:00.000Z'),
        status: 'paused',
      }),
    );

    const result = await service.dispatchTriggeredRuns({
      campaignId,
      organizationId,
      postingRecommendations: [],
      strategies: [createStrategy() as never],
      triggerContextLines: [],
      triggerMetadata: {},
      triggerSummary: 'View velocity collapsed',
      triggerType: 'performance_dip',
    });

    expect(result).toMatchObject({
      campaignId,
      dispatchCount: 0,
      skippedReason: 'Campaign is paused, skipping trigger dispatch.',
    });
    expect(agentRunsService.create).not.toHaveBeenCalled();
  });

  it('dispatchTriggeredRuns skips when no strategies are selected', async () => {
    const { agentCampaignsService, agentRunsService, service } =
      createService();

    agentCampaignsService.findOneById.mockResolvedValue(createCampaign());

    const result = await service.dispatchTriggeredRuns({
      campaignId,
      organizationId,
      postingRecommendations: [],
      strategies: [],
      triggerContextLines: [],
      triggerMetadata: {},
      triggerSummary: 'Trend spike detected',
      triggerType: 'trend_spike',
    });

    expect(result).toMatchObject({
      campaignId,
      dispatchCount: 0,
      skippedReason: 'No strategies selected for trigger dispatch.',
    });
    expect(agentRunsService.create).not.toHaveBeenCalled();
  });

  it('dispatchTriggeredRuns skips when the campaign credit budget is exhausted', async () => {
    const {
      agentCampaignsService,
      agentGoalsService,
      agentRunsService,
      analyticsService,
      service,
    } = createService();

    agentCampaignsService.findOneById.mockResolvedValue(
      createCampaign({
        creditsAllocated: 5,
        creditsUsed: 5,
        nextOrchestratedAt: new Date('2026-04-01T12:00:00.000Z'),
      }),
    );
    agentGoalsService.getGoalSummary.mockResolvedValue(
      'Increase qualified engagement',
    );
    analyticsService.getOverview.mockResolvedValue({
      avgEngagementRate: 6.1,
      totalPosts: 2,
      totalViews: 640,
    });

    const result = await service.dispatchTriggeredRuns({
      campaignId,
      organizationId,
      postingRecommendations: [],
      strategies: [createStrategy() as never],
      triggerContextLines: [],
      triggerMetadata: {},
      triggerSummary: 'Trend spike detected',
      triggerType: 'trend_spike',
    });

    expect(result).toMatchObject({
      campaignId,
      dispatchCount: 0,
      skippedReason: 'Campaign credit budget is exhausted.',
    });
    expect(agentRunsService.create).not.toHaveBeenCalled();
  });

  it('dispatchTriggeredRuns creates and queues trigger-driven runs', async () => {
    const {
      agentCampaignsService,
      agentGoalsService,
      agentMemoryCaptureService,
      agentRunQueueService,
      agentRunsService,
      analyticsService,
      logger,
    } = createService();
    const strategyId = new Types.ObjectId().toHexString();
    const runId = new Types.ObjectId().toHexString();
    const strategy = {
      _id: new Types.ObjectId(strategyId),
      agentType: 'general',
      autonomyMode: 'supervised',
      dailyCreditBudget: 25,
      label: 'Engagement responder',
      platforms: ['twitter'],
      topics: ['ai marketing'],
    };

    agentCampaignsService.findOneById.mockResolvedValue({
      _id: new Types.ObjectId(campaignId),
      brand: new Types.ObjectId(brandId),
      brief: 'React to spikes',
      label: 'Spring Push',
      nextOrchestratedAt: new Date('2026-04-01T12:00:00.000Z'),
      organization: new Types.ObjectId(organizationId),
      status: 'active',
      user: new Types.ObjectId(userId),
    });
    agentGoalsService.getGoalSummary.mockResolvedValue(
      'Increase qualified engagement',
    );
    analyticsService.getOverview.mockResolvedValue({
      avgEngagementRate: 7.2,
      growth: { engagement: 12, posts: 4, views: 18 },
      totalPosts: 4,
      totalViews: 3200,
    });
    agentMemoryCaptureService.capture.mockResolvedValue({
      memory: { _id: new Types.ObjectId() },
      wroteBrandInsight: false,
      wroteContextMemory: false,
    });
    agentRunsService.create.mockResolvedValue({
      _id: new Types.ObjectId(runId),
    });
    agentRunsService.mergeMetadata.mockResolvedValue(undefined);
    agentRunsService.patch.mockResolvedValue(undefined);
    agentRunQueueService.queueRun.mockResolvedValue(undefined);

    const triggerService = new ContentEngineService(
      agentCampaignsService as never,
      { findOneById: vi.fn() } as never,
      agentGoalsService as never,
      agentRunsService as never,
      agentRunQueueService as never,
      analyticsService as never,
      agentMemoryCaptureService as never,
      { queueExtraction: vi.fn() } as never,
      { queueCampaignRun: vi.fn() } as never,
      logger as never,
    );

    const result = await triggerService.dispatchTriggeredRuns({
      campaignId,
      contentMixSummary: 'Increase video share in the next dispatch.',
      organizationId,
      postingRecommendations: [
        {
          avgEngagementRate: 9.4,
          hour: 14,
          platform: 'twitter',
          postCount: 6,
        },
      ],
      strategies: [strategy as never],
      triggerContextLines: [
        'Trend topic: AI marketing hooks',
        'Growth rate: 34%',
      ],
      triggerMetadata: {
        growthRate: 34,
        platform: 'twitter',
        topic: 'AI marketing hooks',
        viralityScore: 90,
      },
      triggerSummary:
        'Trend spike detected for "AI marketing hooks" on twitter.',
      triggerType: 'trend_spike',
    });

    expect(agentRunsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Campaign trigger: Spring Push -> Engagement responder',
        metadata: expect.objectContaining({
          campaignId,
          dispatchedBy: 'campaign_trigger_evaluator',
          triggerType: 'trend_spike',
        }),
      }),
    );
    expect(agentRunQueueService.queueRun).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId,
        organizationId,
        runId,
        strategyId,
        userId,
      }),
    );
    expect(result.dispatchCount).toBe(1);
    expect(result.summary).toContain('trend_spike');
  });
});
