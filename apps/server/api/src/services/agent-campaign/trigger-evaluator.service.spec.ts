import { describe, expect, it, vi } from 'vitest';

import { TriggerEvaluatorService } from './trigger-evaluator.service';

describe('TriggerEvaluatorService', () => {
  const campaignId = 'test-object-id';
  const organizationId = 'test-object-id';
  const userId = 'test-object-id';
  const brandId = 'test-object-id';
  const strategyId = 'test-object-id';
  // Deliberately distinct from `brandId` so a scalar-FK read is distinguishable
  // from a Mongo-era alias read in the assertions below.
  const scalarBrandId = 'brand-scalar-id';

  function createService() {
    const agentCampaignsService = {
      findOneById: vi.fn(),
    };
    const agentStrategiesService = {
      findOneById: vi.fn(),
      patch: vi.fn(),
    };
    const analyticsService = {
      getBestPostingTimes: vi.fn(),
      getOverview: vi.fn(),
      getTopContent: vi.fn(),
    };
    const brandsService = {
      findOne: vi.fn(),
    };
    const trendsService = {
      getTrends: vi.fn(),
    };
    const contentEngineService = {
      dispatchTriggeredRuns: vi.fn(),
    };
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    return {
      agentCampaignsService,
      agentStrategiesService,
      analyticsService,
      brandsService,
      contentEngineService,
      logger,
      service: new TriggerEvaluatorService(
        agentCampaignsService as never,
        agentStrategiesService as never,
        analyticsService as never,
        brandsService as never,
        trendsService as never,
        contentEngineService as never,
        logger as never,
      ),
      trendsService,
    };
  }

  /**
   * Primes every analytics loader with empty/idle data so `evaluateCampaign`
   * runs the full scope-resolution path and then short-circuits on "no trigger
   * thresholds met". Keeps the scoping assertions free of dispatch setup.
   */
  function primeIdleLoaders(mocks: ReturnType<typeof createService>): void {
    mocks.agentStrategiesService.findOneById.mockResolvedValue({
      id: strategyId,
      isActive: true,
      isEnabled: true,
      label: 'Trend Watcher',
      opportunitySources: {
        eventTriggersEnabled: true,
        trendWatchersEnabled: true,
      },
      platforms: ['twitter'],
      topics: ['ai marketing'],
    });
    mocks.analyticsService.getOverview.mockResolvedValue({
      avgEngagementRate: 1,
      growth: { engagement: 1, posts: 1, views: 1 },
      totalPosts: 1,
      totalViews: 10,
    });
    mocks.analyticsService.getBestPostingTimes.mockResolvedValue([]);
    mocks.analyticsService.getTopContent.mockResolvedValue([]);
    mocks.trendsService.getTrends.mockResolvedValue([]);
  }

  it('scopes the brand read with the campaign scalar brand id', async () => {
    const mocks = createService();
    const { agentCampaignsService, analyticsService, brandsService, service } =
      mocks;

    primeIdleLoaders(mocks);
    agentCampaignsService.findOneById.mockResolvedValue({
      id: campaignId,
      agents: [strategyId],
      // Only the scalar FK is present. `brand` is the Mongo-era alias and is
      // `undefined` on an unpopulated read, which used to leave both filter
      // values undefined — `normalizeWhere` dropped them and the lookup
      // returned an arbitrary brand row.
      brandId: scalarBrandId,
      label: 'Spring Push',
      organizationId,
      status: 'active',
      userId,
    });
    brandsService.findOne.mockResolvedValue({
      description: 'AI marketing systems for creators',
      label: 'Acme',
    });

    await service.evaluateCampaign(campaignId, organizationId);

    expect(brandsService.findOne).toHaveBeenCalledWith({
      _id: scalarBrandId,
      isDeleted: false,
      organization: organizationId,
    });
    expect(analyticsService.getOverview).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      scalarBrandId,
      organizationId,
    );
  });

  it('skips the brand read entirely when no brand id can be resolved', async () => {
    const mocks = createService();
    const { agentCampaignsService, analyticsService, brandsService, service } =
      mocks;

    primeIdleLoaders(mocks);
    agentCampaignsService.findOneById.mockResolvedValue({
      id: campaignId,
      agents: [strategyId],
      label: 'Spring Push',
      organizationId,
      status: 'active',
      userId,
    });

    await service.evaluateCampaign(campaignId, organizationId);

    expect(brandsService.findOne).not.toHaveBeenCalled();
    expect(analyticsService.getOverview).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      undefined,
      organizationId,
    );
  });

  it('dispatches a trend spike through the content engine', async () => {
    const {
      agentCampaignsService,
      agentStrategiesService,
      analyticsService,
      brandsService,
      trendsService,
      contentEngineService,
      service,
    } = createService();

    agentCampaignsService.findOneById.mockResolvedValue({
      id: campaignId,
      agents: [strategyId],
      // Scalars are the real columns; the aliases stay to prove the fallback.
      brand: brandId,
      brandId,
      brief: 'Build AI marketing momentum',
      label: 'Spring Push',
      organization: organizationId,
      organizationId,
      status: 'active',
      user: userId,
      userId,
    });
    agentStrategiesService.findOneById.mockResolvedValue({
      id: strategyId,
      isActive: true,
      isEnabled: true,
      label: 'Trend Watcher',
      opportunitySources: {
        eventTriggersEnabled: true,
        trendWatchersEnabled: true,
      },
      platforms: ['twitter'],
      topics: ['ai marketing'],
    });
    analyticsService.getOverview.mockResolvedValue({
      avgEngagementRate: 6.3,
      growth: { engagement: 5, posts: 8, views: 22 },
      totalPosts: 8,
      totalViews: 4100,
    });
    analyticsService.getBestPostingTimes.mockResolvedValue([
      {
        avgEngagementRate: 9.4,
        hour: 14,
        platform: 'twitter',
        postCount: 6,
      },
    ]);
    analyticsService.getTopContent.mockResolvedValue([]);
    brandsService.findOne.mockResolvedValue({
      description: 'AI marketing systems for creators',
      label: 'Acme',
      text: 'AI marketing hooks and launches',
    });
    trendsService.getTrends.mockResolvedValue([
      {
        growthRate: 38,
        mentions: 120,
        metadata: {
          creatorHandle: '@growthops',
          sampleContent: 'AI marketing hooks that convert',
        },
        platform: 'twitter',
        topic: 'AI marketing hooks',
        viralityScore: 92,
      },
    ]);
    agentStrategiesService.patch.mockResolvedValue(undefined);
    contentEngineService.dispatchTriggeredRuns.mockResolvedValue({
      campaignId,
      dispatchCount: 1,
      dispatchedRuns: [],
      nextOrchestratedAt: null,
      summary: 'Dispatched 1 run for trend_spike.',
    });

    const result = await service.evaluateCampaign(campaignId, organizationId);

    expect(agentStrategiesService.patch).toHaveBeenCalledWith(strategyId, {
      preferredPostingTimes: ['14:00'],
    });
    expect(contentEngineService.dispatchTriggeredRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId,
        organizationId,
        postingRecommendations: [
          {
            avgEngagementRate: 9.4,
            hour: 14,
            platform: 'twitter',
            postCount: 6,
          },
        ],
        strategies: [
          expect.objectContaining({
            label: 'Trend Watcher',
          }),
        ],
        triggerType: 'trend_spike',
      }),
    );
    expect(result.dispatchCount).toBe(1);
    expect(result.dispatchedTriggerTypes).toEqual(['trend_spike']);
  });

  it('dispatches viral post responses when engagement crosses the threshold', async () => {
    const {
      agentCampaignsService,
      agentStrategiesService,
      analyticsService,
      brandsService,
      trendsService,
      contentEngineService,
      service,
    } = createService();

    agentCampaignsService.findOneById.mockResolvedValue({
      id: campaignId,
      agents: [strategyId],
      brand: brandId,
      brandId,
      label: 'Spring Push',
      organization: organizationId,
      organizationId,
      status: 'active',
      user: userId,
      userId,
    });
    agentStrategiesService.findOneById.mockResolvedValue({
      id: strategyId,
      engagementEnabled: true,
      isActive: true,
      isEnabled: true,
      label: 'Reply Responder',
      opportunitySources: {
        eventTriggersEnabled: true,
        trendWatchersEnabled: false,
      },
      platforms: ['twitter'],
      topics: ['community growth'],
    });
    analyticsService.getOverview.mockResolvedValue({
      avgEngagementRate: 8.8,
      growth: { engagement: 24, posts: 4, views: 31 },
      totalPosts: 4,
      totalViews: 6200,
    });
    analyticsService.getBestPostingTimes.mockResolvedValue([]);
    analyticsService.getTopContent.mockResolvedValue([
      {
        description: 'A post that took off overnight',
        engagementRate: 12.4,
        isVideo: false,
        label: 'Hook teardown',
        platform: 'twitter',
        totalViews: 8300,
      },
    ]);
    brandsService.findOne.mockResolvedValue(null);
    trendsService.getTrends.mockResolvedValue([]);
    agentStrategiesService.patch.mockResolvedValue(undefined);
    contentEngineService.dispatchTriggeredRuns.mockResolvedValue({
      campaignId,
      dispatchCount: 1,
      dispatchedRuns: [],
      nextOrchestratedAt: null,
      summary: 'Dispatched 1 run for viral_post.',
    });

    const result = await service.evaluateCampaign(campaignId, organizationId);

    expect(contentEngineService.dispatchTriggeredRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerMetadata: expect.objectContaining({
          engagementRate: 12.4,
          label: 'Hook teardown',
        }),
        triggerType: 'viral_post',
      }),
    );
    expect(result.dispatchedTriggerTypes).toEqual(['viral_post']);
  });
});
