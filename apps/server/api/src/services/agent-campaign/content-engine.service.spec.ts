import { AnalyticsMetric } from '@genfeedai/enums';
import { describe, expect, it, vi } from 'vitest';
import { CampaignWinnerExtractionService } from './campaign-winner-extraction.service';
import { ContentEngineService } from './content-engine.service';
import { ContentRotationService } from './content-rotation.service';

describe('ContentEngineService', () => {
  const campaignId = 'test-object-id';
  const organizationId = 'test-object-id';
  const userId = 'test-object-id';
  const brandId = 'test-object-id';

  function createCampaign(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      id: campaignId,
      agents: [],
      brandId,
      brief: 'React to signal changes',
      creditsAllocated: 100,
      creditsUsed: 20,
      label: 'Spring Push',
      orchestrationEnabled: true,
      orchestrationIntervalHours: 6,
      organizationId,
      status: 'active',
      userId,
      ...overrides,
    };
  }

  function createStrategy(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      id: 'test-object-id',
      agentType: 'general',
      autonomyMode: 'supervised',
      dailyCreditBudget: 25,
      displayRole: 'Engagement responder',
      isEnabled: true,
      label: 'Engagement responder',
      model: 'openai/gpt-5.6-terra',
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
      findRecentByOrganization: vi.fn(),
      mergeMetadata: vi.fn(),
      patch: vi.fn(),
    };
    const agentRuntimeService = {
      startTurn: vi.fn(),
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
      agentRuntimeService,
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
        new ContentRotationService(),
        analyticsService as never,
        agentMemoryCaptureService as never,
        campaignMemoryQueueService as never,
        orchestratorQueueService as never,
        new CampaignWinnerExtractionService(
          agentCampaignsService as never,
          analyticsService as never,
          agentMemoryCaptureService as never,
          logger as never,
        ),
        logger as never,
        agentRuntimeService as never,
      ),
    };
  }

  it('runOrchestrationCycle finalizes a skipped cycle when the campaign is not active', async () => {
    const { agentCampaignsService, agentRuntimeService, service } =
      createService();

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
    expect(agentRuntimeService.startTurn).not.toHaveBeenCalled();
  });

  it('runOrchestrationCycle completes the campaign when the remaining credit budget is exhausted', async () => {
    const {
      agentCampaignsService,
      agentGoalsService,
      agentRuntimeService,
      agentStrategiesService,
      analyticsService,
      service,
    } = createService();
    const strategy = createStrategy();
    const campaign = createCampaign({
      agents: [strategy.id],
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
    expect(agentRuntimeService.startTurn).not.toHaveBeenCalled();
  });

  it('runOrchestrationCycle dispatches eligible specialist strategies and captures decision memory', async () => {
    const {
      agentCampaignsService,
      agentGoalsService,
      agentMemoryCaptureService,
      agentRuntimeService,
      agentRunsService,
      agentStrategiesService,
      analyticsService,
      service,
    } = createService();
    const strategy = createStrategy({
      dailyCreditBudget: 24,
      goalId: 'test-object-id',
      topics: ['ai marketing', 'creator growth'],
    });
    const runId = 'test-object-id';
    const campaign = createCampaign({ agents: [strategy.id] });

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
    agentRunsService.findRecentByOrganization.mockResolvedValue([]);
    agentRunsService.mergeMetadata.mockResolvedValue(undefined);
    agentRunsService.patch.mockResolvedValue(undefined);
    agentRuntimeService.startTurn.mockResolvedValue({
      runId,
      threadId: 'thread-id',
    });
    agentMemoryCaptureService.capture.mockResolvedValue({
      memory: { id: 'test-object-id' },
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
    expect(agentRuntimeService.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId,
        creditBudget: 24,
        organizationId,
        strategyId: String(strategy.id),
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
    expect(agentRunsService.mergeMetadata).toHaveBeenCalledWith(
      runId,
      organizationId,
      expect.objectContaining({
        campaignId,
        orchestrationSummary: expect.stringContaining('specialist run'),
      }),
    );
    expect(agentRunsService.patch).not.toHaveBeenCalled();
  });

  it('runOrchestrationCycle favors the underrepresented weighted rotation target', async () => {
    const {
      agentCampaignsService,
      agentGoalsService,
      agentMemoryCaptureService,
      agentRuntimeService,
      agentRunsService,
      agentStrategiesService,
      analyticsService,
      service,
    } = createService();
    const launchStrategy = createStrategy({
      id: 'launch-strategy',
      label: 'Launch specialist',
      platforms: ['linkedin'],
      topics: ['launch'],
    });
    const educationStrategy = createStrategy({
      id: 'education-strategy',
      label: 'Education specialist',
      platforms: ['linkedin'],
      topics: ['education'],
    });
    const campaign = createCampaign({
      agents: [launchStrategy.id, educationStrategy.id],
      contentRotation: {
        enabled: true,
        targets: [
          { key: 'launch', topic: 'launch', weight: 60 },
          { key: 'education', topic: 'education', weight: 40 },
        ],
      },
    });

    agentCampaignsService.findOne.mockResolvedValue(campaign);
    agentCampaignsService.patch.mockResolvedValue(undefined);
    agentStrategiesService.findOneById.mockImplementation((strategyId) =>
      Promise.resolve(
        strategyId === 'launch-strategy' ? launchStrategy : educationStrategy,
      ),
    );
    agentGoalsService.getGoalSummary.mockResolvedValue('Increase engagement');
    analyticsService.getOverview.mockResolvedValue({
      avgEngagementRate: 7.2,
      totalPosts: 4,
      totalViews: 3200,
    });
    agentRunsService.findRecentByOrganization.mockResolvedValue([
      {
        id: 'run-1',
        metadata: { campaignId, contentRotationTargetKey: 'launch' },
      },
      {
        id: 'run-2',
        metadata: { campaignId, contentRotationTargetKey: 'launch' },
      },
      {
        id: 'run-3',
        metadata: { campaignId, contentRotationTargetKey: 'education' },
      },
    ]);
    agentRunsService.mergeMetadata.mockResolvedValue(undefined);
    agentRunsService.patch.mockResolvedValue(undefined);
    agentRuntimeService.startTurn.mockResolvedValue({
      runId: 'education-run',
      threadId: 'thread-id',
    });
    agentMemoryCaptureService.capture.mockResolvedValue({
      memory: { id: 'test-object-id' },
      wroteBrandInsight: false,
      wroteContextMemory: true,
    });

    const result = await service.runOrchestrationCycle(
      campaignId,
      organizationId,
    );

    expect(result.dispatchCount).toBe(1);
    expect(result.dispatchedRuns[0]).toMatchObject({
      strategyId: 'education-strategy',
    });
    expect(result.summary).toContain('Weighted rotation: selected education');
    expect(agentRuntimeService.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        strategyId: 'education-strategy',
        metadata: expect.objectContaining({
          campaignId,
          contentRotationTargetKey: 'education',
          contentRotationTopic: 'education',
        }),
      }),
    );
  });

  it('passes the full candidate pool to weighted rotation and widens the run-history lookback', async () => {
    const {
      agentCampaignsService,
      agentGoalsService,
      agentMemoryCaptureService,
      agentRuntimeService,
      agentRunsService,
      agentStrategiesService,
      analyticsService,
      service,
    } = createService();

    // More strategies than MAX_ORCHESTRATED_STRATEGIES_PER_RUN (5) so the old
    // pre-select `.slice(0, MAX)` would have hidden the tail from rotation.
    const strategies = Array.from({ length: 7 }, (_, i) =>
      createStrategy({
        id: `strategy-${i}`,
        label: `Specialist ${i}`,
        platforms: ['linkedin'],
        topics: [`topic-${i}`],
      }),
    );
    const campaign = createCampaign({
      agents: strategies.map((s) => s.id),
      contentRotation: {
        enabled: true,
        targets: strategies.map((_strategy, i) => ({
          key: `topic-${i}`,
          topic: `topic-${i}`,
          weight: 10,
        })),
      },
    });

    agentCampaignsService.findOne.mockResolvedValue(campaign);
    agentCampaignsService.patch.mockResolvedValue(undefined);
    agentStrategiesService.findOneById.mockImplementation((strategyId) =>
      Promise.resolve(strategies.find((s) => s.id === strategyId)),
    );
    agentGoalsService.getGoalSummary.mockResolvedValue('Increase engagement');
    analyticsService.getOverview.mockResolvedValue({
      avgEngagementRate: 7.2,
      totalPosts: 4,
      totalViews: 3200,
    });
    // Empty history: every target is equally underrepresented, so rotation is
    // free to pick any candidate — what matters is that it SEES all 7.
    agentRunsService.findRecentByOrganization.mockResolvedValue([]);
    agentRunsService.mergeMetadata.mockResolvedValue(undefined);
    agentRunsService.patch.mockResolvedValue(undefined);
    agentRuntimeService.startTurn.mockResolvedValue({
      runId: 'run',
      threadId: 'thread-id',
    });
    agentMemoryCaptureService.capture.mockResolvedValue({
      memory: { id: 'test-object-id' },
      wroteBrandInsight: false,
      wroteContextMemory: true,
    });

    const selectSpy = vi.spyOn(
      ContentRotationService.prototype,
      'selectStrategies',
    );

    const result = await service.runOrchestrationCycle(
      campaignId,
      organizationId,
    );

    // Finding 1: rotation must receive every eligible strategy, not a pre-capped
    // slice of the first 5.
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(selectSpy.mock.calls[0][0].strategies).toHaveLength(7);

    // Finding 2: the run-history window is widened past the org-wide default of
    // 200 so a busy org cannot starve a single campaign's rotation history.
    expect(agentRunsService.findRecentByOrganization).toHaveBeenCalledWith(
      organizationId,
      expect.any(Date),
      1000,
    );

    // Dispatch still happens and is capped at MAX (5) by the post-select slice.
    expect(result.dispatchCount).toBeGreaterThanOrEqual(1);
    expect(result.dispatchCount).toBeLessThanOrEqual(5);

    selectSpy.mockRestore();
  });

  it('extractWinnerPatterns stores a campaign-scoped winner memory', async () => {
    const {
      agentCampaignsService,
      agentMemoryCaptureService,
      analyticsService,
      service,
    } = createService();
    agentCampaignsService.findOne.mockResolvedValue({
      id: campaignId,
      brandId,
      label: 'Spring Push',
      organizationId,
      status: 'active',
      userId,
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
      memory: { id: 'test-object-id' },
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
    const { agentCampaignsService, agentRuntimeService, service } =
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
    expect(agentRuntimeService.startTurn).not.toHaveBeenCalled();
  });

  it('dispatchTriggeredRuns skips when no strategies are selected', async () => {
    const { agentCampaignsService, agentRuntimeService, service } =
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
    expect(agentRuntimeService.startTurn).not.toHaveBeenCalled();
  });

  it('dispatchTriggeredRuns skips when the campaign credit budget is exhausted', async () => {
    const {
      agentCampaignsService,
      agentGoalsService,
      agentRuntimeService,
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
    expect(agentRuntimeService.startTurn).not.toHaveBeenCalled();
  });

  it('dispatchTriggeredRuns creates and queues trigger-driven runs', async () => {
    const {
      agentCampaignsService,
      agentGoalsService,
      agentMemoryCaptureService,
      agentRuntimeService,
      agentRunsService,
      analyticsService,
      logger,
    } = createService();
    const strategyId = 'test-object-id';
    const runId = 'test-object-id';
    const strategy = {
      id: strategyId,
      agentType: 'general',
      autonomyMode: 'supervised',
      dailyCreditBudget: 25,
      label: 'Engagement responder',
      platforms: ['twitter'],
      topics: ['ai marketing'],
    };

    agentCampaignsService.findOneById.mockResolvedValue({
      id: campaignId,
      brandId,
      brief: 'React to spikes',
      label: 'Spring Push',
      nextOrchestratedAt: new Date('2026-04-01T12:00:00.000Z'),
      organizationId,
      status: 'active',
      userId,
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
      memory: { id: 'test-object-id' },
      wroteBrandInsight: false,
      wroteContextMemory: false,
    });
    agentRunsService.mergeMetadata.mockResolvedValue(undefined);
    agentRunsService.patch.mockResolvedValue(undefined);
    agentRuntimeService.startTurn.mockResolvedValue({
      runId,
      threadId: 'thread-id',
    });

    const triggerService = new ContentEngineService(
      agentCampaignsService as never,
      { findOneById: vi.fn() } as never,
      agentGoalsService as never,
      agentRunsService as never,
      new ContentRotationService(),
      analyticsService as never,
      agentMemoryCaptureService as never,
      { queueExtraction: vi.fn() } as never,
      { queueCampaignRun: vi.fn() } as never,
      new CampaignWinnerExtractionService(
        agentCampaignsService as never,
        analyticsService as never,
        agentMemoryCaptureService as never,
        logger as never,
      ),
      logger as never,
      agentRuntimeService as never,
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

    expect(agentRuntimeService.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId,
        label: 'Campaign trigger: Spring Push -> Engagement responder',
        metadata: expect.objectContaining({
          campaignId,
          dispatchedBy: 'campaign_trigger_evaluator',
          triggerType: 'trend_spike',
        }),
        organizationId,
        strategyId,
        userId,
      }),
    );
    expect(agentRunsService.mergeMetadata).toHaveBeenCalledWith(
      runId,
      organizationId,
      expect.objectContaining({
        campaignId,
        orchestrationDispatchReason: expect.any(String),
        triggerMetadata: expect.objectContaining({
          topic: 'AI marketing hooks',
        }),
        triggerType: 'trend_spike',
      }),
    );
    expect(agentRunsService.patch).not.toHaveBeenCalled();
    expect(result.dispatchCount).toBe(1);
    expect(result.summary).toContain('trend_spike');
  });
});
