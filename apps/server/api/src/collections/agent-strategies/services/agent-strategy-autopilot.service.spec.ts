import { AgentStrategyAutopilotService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.service';

describe('AgentStrategyAutopilotService', () => {
  const strategyId = 'test-object-id';
  const organizationId = 'test-object-id';
  const brandId = 'test-object-id';

  const baseStrategy = {
    _id: strategyId,
    agentType: 'general',
    autonomyMode: 'auto_publish',
    brand: brandId,
    budgetPolicy: {
      maxRetriesPerOpportunity: 1,
      monthlyCreditBudget: 500,
      reserveTrendBudget: 125,
    },
    contentMix: {},
    creditsUsedThisWeek: 0,
    dailyCreditBudget: 100,
    dailyCreditsUsed: 0,
    goalProfile: 'reach_traffic',
    label: 'Autopilot',
    monthToDateCreditsUsed: 0,
    opportunitySources: {
      eventTriggersEnabled: false,
      evergreenCadenceEnabled: false,
      trendWatchersEnabled: false,
    },
    organization: organizationId,
    platforms: ['twitter'],
    postsPerWeek: 3,
    publishPolicy: {
      autoPublishEnabled: true,
      brandSafetyMode: 'standard',
      minImageScore: 75,
      minPostScore: 70,
      videoAutopublishEnabled: false,
    },
    rankingPolicy: {
      costEfficiencyWeight: 0.15,
      expectedTrafficWeight: 0.2,
      freshnessWeight: 0.2,
      historicalConfidenceWeight: 0.15,
      relevanceWeight: 0.3,
    },
    reportingPolicy: {
      dailyDigestEnabled: false,
      reportRecipientUserIds: [],
      weeklySummaryEnabled: false,
    },
    reserveTrendBudgetRemaining: 125,
    runHistory: [],
    topics: ['AI hooks'],
    user: 'test-object-id',
    weeklyCreditBudget: 300,
  };

  function createService() {
    const agentStrategiesService = {
      findOneById: vi.fn().mockResolvedValue(baseStrategy),
      patch: vi.fn().mockResolvedValue(undefined),
    };
    const opportunitiesService = {
      createIfMissing: vi.fn(),
      expireStaleOpportunities: vi.fn().mockResolvedValue(0),
      listByStrategy: vi.fn().mockResolvedValue([]),
      listOpenByStrategy: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };
    const reportsService = {
      createReport: vi.fn().mockResolvedValue({ _id: 'test-object-id' }),
      listByStrategy: vi.fn().mockResolvedValue([]),
    };
    const activitiesService = {
      create: vi.fn().mockResolvedValue({ _id: 'test-object-id' }),
    };
    const trendsService = {
      getTrends: vi.fn().mockResolvedValue([]),
    };
    const brandsService = {};
    const contentGatewayService = {
      processManualRequest: vi.fn(),
    };
    const contentDraftsService = {
      approve: vi.fn().mockResolvedValue(undefined),
      find: vi.fn().mockResolvedValue([]),
      patch: vi.fn().mockResolvedValue(undefined),
      reject: vi.fn().mockResolvedValue(undefined),
    };
    const optimizersService = {
      analyzeContent: vi.fn(),
      optimizeContent: vi.fn(),
    };
    const evaluationsOperationsService = {
      evaluateImage: vi.fn(),
    };
    const credentialsService = {
      findOne: vi.fn().mockResolvedValue({
        _id: 'test-object-id',
        platform: 'twitter',
      }),
    };
    const postsService = {
      create: vi.fn().mockResolvedValue({ _id: 'test-object-id' }),
    };
    const batchGenerationService = {
      createManualReviewBatch: vi.fn().mockResolvedValue({
        id: 'batch-1',
        items: [
          {
            id: 'test-object-id',
            postId: 'test-object-id',
          },
        ],
      }),
    };
    const contentPerformanceService = {
      queryPerformance: vi.fn().mockResolvedValue([]),
    };
    const performanceSummaryService = {
      getWeeklySummary: vi.fn().mockResolvedValue({
        bestPostingTimes: [],
        topHooks: [],
      }),
    };
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const service = new AgentStrategyAutopilotService(
      agentStrategiesService as never,
      opportunitiesService as never,
      reportsService as never,
      activitiesService as never,
      trendsService as never,
      brandsService as never,
      contentGatewayService as never,
      contentDraftsService as never,
      optimizersService as never,
      evaluationsOperationsService as never,
      credentialsService as never,
      postsService as never,
      batchGenerationService as never,
      contentPerformanceService as never,
      performanceSummaryService as never,
      logger as never,
    );

    return {
      activitiesService,
      agentStrategiesService,
      batchGenerationService,
      contentDraftsService,
      contentGatewayService,
      credentialsService,
      evaluationsOperationsService,
      opportunitiesService,
      optimizersService,
      postsService,
      reportsService,
      service,
    };
  }

  it('returns early when monthly pacing budget is exhausted', async () => {
    const deps = createService();

    deps.agentStrategiesService.findOneById.mockResolvedValue({
      ...baseStrategy,
      monthToDateCreditsUsed: 500,
    });
    deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([
      {
        _id: 'test-object-id',
        estimatedCreditCost: 10,
        formatCandidates: ['text'],
        platformCandidates: ['twitter'],
        priorityScore: 90,
        sourceType: 'evergreen',
        status: 'queued',
        topic: 'AI hooks',
      },
    ]);

    const result = await deps.service.executeQueuedRun({
      organizationId: organizationId.toString(),
      runId: 'run-1',
      strategyId: strategyId.toString(),
      userId: 'test-object-id',
    });

    expect(result.creditsUsed).toBe(0);
    expect(
      deps.contentGatewayService.processManualRequest,
    ).not.toHaveBeenCalled();
  });

  it('revises a weak post once and discards it when the revised version still fails', async () => {
    const deps = createService();
    const opportunityId = 'test-object-id';

    deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([
      {
        _id: opportunityId,
        estimatedCreditCost: 10,
        formatCandidates: ['text'],
        platformCandidates: ['twitter'],
        priorityScore: 90,
        sourceType: 'evergreen',
        status: 'queued',
        topic: 'AI hooks',
      },
    ]);

    deps.contentGatewayService.processManualRequest.mockResolvedValue({
      drafts: [
        {
          _id: 'test-object-id',
          content: 'Weak draft',
          mediaUrls: [],
          metadata: {},
          status: 'pending',
        },
      ],
      runs: ['run-1'],
    });

    deps.optimizersService.analyzeContent
      .mockResolvedValueOnce({
        breakdown: {
          clarity: 40,
          engagement: 45,
          platformOptimization: 50,
          readability: 55,
        },
        metadata: { hasCallToAction: false },
        overallScore: 60,
      })
      .mockResolvedValueOnce({
        breakdown: {
          clarity: 55,
          engagement: 58,
          platformOptimization: 55,
          readability: 60,
        },
        metadata: { hasCallToAction: false },
        overallScore: 62,
      });
    deps.optimizersService.optimizeContent.mockResolvedValue({
      changes: [],
      improvementScore: 5,
      optimized: 'Still weak',
      original: 'Weak draft',
    });

    const result = await deps.service.executeQueuedRun({
      organizationId: organizationId.toString(),
      runId: 'run-1',
      strategyId: strategyId.toString(),
      userId: 'test-object-id',
    });

    expect(result.contentGenerated).toBe(1);
    expect(deps.optimizersService.optimizeContent).toHaveBeenCalledTimes(1);
    expect(deps.contentDraftsService.reject).toHaveBeenCalledTimes(1);
    expect(deps.postsService.create).not.toHaveBeenCalled();
  });

  it('holds a low-scoring image without auto-publishing it', async () => {
    const deps = createService();

    deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([
      {
        _id: 'test-object-id',
        estimatedCreditCost: 24,
        formatCandidates: ['image'],
        platformCandidates: ['instagram'],
        priorityScore: 90,
        sourceType: 'trend',
        status: 'queued',
        topic: 'Product hero',
      },
    ]);

    deps.contentGatewayService.processManualRequest.mockResolvedValue({
      drafts: [
        {
          _id: 'test-object-id',
          content: 'Generated image',
          mediaUrls: ['https://cdn.example.com/image.png'],
          metadata: {},
          status: 'pending',
        },
      ],
      runs: ['run-1'],
    });

    deps.evaluationsOperationsService.evaluateImage.mockResolvedValue({
      overallScore: 50,
      scores: {
        brand: { overall: 52 },
        engagement: { overall: 49 },
        technical: { overall: 50 },
      },
    });

    await deps.service.executeQueuedRun({
      organizationId: organizationId.toString(),
      runId: 'run-1',
      strategyId: strategyId.toString(),
      userId: 'test-object-id',
    });

    expect(deps.contentDraftsService.reject).toHaveBeenCalledTimes(1);
    expect(deps.postsService.create).not.toHaveBeenCalled();
  });

  it('hands off a strong image to the manual review queue', async () => {
    const deps = createService();

    deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([
      {
        _id: 'test-object-id',
        estimatedCreditCost: 24,
        formatCandidates: ['image'],
        platformCandidates: ['instagram'],
        priorityScore: 90,
        sourceType: 'trend',
        status: 'queued',
        topic: 'Product hero',
      },
    ]);

    deps.contentGatewayService.processManualRequest.mockResolvedValue({
      drafts: [
        {
          _id: 'test-object-id',
          content: 'Generated image',
          mediaUrls: ['https://cdn.example.com/image.png'],
          metadata: {},
          status: 'pending',
        },
      ],
      runs: ['run-1'],
    });

    deps.evaluationsOperationsService.evaluateImage.mockResolvedValue({
      overallScore: 91,
      scores: {
        brand: { overall: 90 },
        engagement: { overall: 92 },
        technical: { overall: 91 },
      },
    });

    await deps.service.executeQueuedRun({
      organizationId: organizationId.toString(),
      runId: 'run-1',
      strategyId: strategyId.toString(),
      userId: 'test-object-id',
    });

    expect(deps.contentDraftsService.approve).toHaveBeenCalledTimes(1);
    expect(
      deps.batchGenerationService.createManualReviewBatch,
    ).toHaveBeenCalledTimes(1);
    expect(
      deps.batchGenerationService.createManualReviewBatch,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            gateOverallScore: 91,
            gateReasons: ['Image cleared the autopilot quality gate.'],
            opportunitySourceType: 'trend',
            opportunityTopic: 'Product hero',
            sourceActionId: expect.any(String),
            sourceWorkflowId: expect.any(String),
          }),
        ],
      }),
      expect.any(String),
      expect.any(String),
    );
    expect(deps.activitiesService.create).toHaveBeenCalledTimes(1);
    expect(deps.postsService.create).not.toHaveBeenCalled();
  });

  it('hands off a strong text draft to the manual review queue when auto-publish is disabled', async () => {
    const deps = createService();

    deps.agentStrategiesService.findOneById.mockResolvedValue({
      ...baseStrategy,
      autonomyMode: 'manual_review',
      publishPolicy: {
        ...baseStrategy.publishPolicy,
        autoPublishEnabled: false,
      },
    });
    deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([
      {
        _id: 'test-object-id',
        estimatedCreditCost: 10,
        formatCandidates: ['text'],
        platformCandidates: ['twitter'],
        priorityScore: 90,
        sourceType: 'evergreen',
        status: 'queued',
        topic: 'AI hooks',
      },
    ]);

    deps.contentGatewayService.processManualRequest.mockResolvedValue({
      drafts: [
        {
          _id: 'test-object-id',
          content: 'Strong post draft',
          mediaUrls: [],
          metadata: {},
          status: 'pending',
        },
      ],
      runs: ['run-1'],
    });

    deps.optimizersService.analyzeContent.mockResolvedValue({
      breakdown: {
        clarity: 85,
        engagement: 84,
        platformOptimization: 82,
        readability: 86,
      },
      metadata: { hasCallToAction: true },
      overallScore: 88,
    });

    await deps.service.executeQueuedRun({
      organizationId: organizationId.toString(),
      runId: 'run-1',
      strategyId: strategyId.toString(),
      userId: 'test-object-id',
    });

    expect(deps.contentDraftsService.approve).toHaveBeenCalledTimes(1);
    expect(
      deps.batchGenerationService.createManualReviewBatch,
    ).toHaveBeenCalledTimes(1);
    expect(
      deps.batchGenerationService.createManualReviewBatch,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            gateOverallScore: 88,
            gateReasons: [
              'Post cleared the autopilot quality gate.',
              'Draft includes a visible call-to-action for traffic intent.',
            ],
            opportunitySourceType: 'evergreen',
            opportunityTopic: 'AI hooks',
            sourceActionId: expect.any(String),
            sourceWorkflowId: expect.any(String),
          }),
        ],
      }),
      expect.any(String),
      expect.any(String),
    );
    expect(deps.activitiesService.create).toHaveBeenCalledTimes(1);
    expect(deps.postsService.create).not.toHaveBeenCalled();
  });

  it('falls back to the manual review queue when auto-publish cannot find a credential', async () => {
    const deps = createService();

    deps.credentialsService.findOne.mockResolvedValue(null);
    deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([
      {
        _id: 'test-object-id',
        estimatedCreditCost: 10,
        formatCandidates: ['text'],
        platformCandidates: ['twitter'],
        priorityScore: 90,
        sourceType: 'evergreen',
        status: 'queued',
        topic: 'AI hooks',
      },
    ]);

    deps.contentGatewayService.processManualRequest.mockResolvedValue({
      drafts: [
        {
          _id: 'test-object-id',
          content: 'Strong post draft',
          mediaUrls: [],
          metadata: {},
          status: 'pending',
        },
      ],
      runs: ['run-1'],
    });

    deps.optimizersService.analyzeContent.mockResolvedValue({
      breakdown: {
        clarity: 85,
        engagement: 84,
        platformOptimization: 82,
        readability: 86,
      },
      metadata: { hasCallToAction: true },
      overallScore: 88,
    });

    await deps.service.executeQueuedRun({
      organizationId: organizationId.toString(),
      runId: 'run-1',
      strategyId: strategyId.toString(),
      userId: 'test-object-id',
    });

    expect(deps.contentDraftsService.approve).toHaveBeenCalledTimes(1);
    expect(
      deps.batchGenerationService.createManualReviewBatch,
    ).toHaveBeenCalledTimes(1);
    expect(
      deps.batchGenerationService.createManualReviewBatch,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            gateOverallScore: 88,
            gateReasons: [
              'Post cleared the autopilot quality gate.',
              'Draft includes a visible call-to-action for traffic intent.',
            ],
            opportunitySourceType: 'evergreen',
            opportunityTopic: 'AI hooks',
            sourceActionId: expect.any(String),
            sourceWorkflowId: expect.any(String),
          }),
        ],
      }),
      expect.any(String),
      expect.any(String),
    );
    expect(deps.activitiesService.create).toHaveBeenCalledTimes(1);
    expect(deps.postsService.create).not.toHaveBeenCalled();
  });
});
