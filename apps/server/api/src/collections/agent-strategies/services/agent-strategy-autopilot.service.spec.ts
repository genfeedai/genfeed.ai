import { AgentStrategyAutopilotService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.service';
import { AgentStrategyAutopilotExecutionService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-execution.service';
import { AgentStrategyAutopilotPerformanceService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-performance.service';
import { AgentStrategyAutopilotPlanningService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-planning.service';

describe('AgentStrategyAutopilotService', () => {
  // Distinct ids per entity: the autopilot helpers read the Prisma scalar `id`,
  // so every assertion below can pin the exact value it expects instead of
  // matching any string.
  const strategyId = 'strategy-id';
  const organizationId = 'organization-id';
  const brandId = 'brand-id';
  const userId = 'user-id';
  const opportunityId = 'opportunity-id';
  const draftId = 'draft-id';
  const credentialId = 'credential-id';
  const postId = 'post-id';
  const reviewItemId = 'review-item-id';
  const reviewPostId = 'review-post-id';

  // Shaped like a real Prisma row: scalar FKs only. The Mongo-era
  // `organization`/`brand`/`user` aliases are undefined on an unpopulated row,
  // so a fixture carrying them hides exactly the bug this suite should catch.
  const baseStrategy = {
    id: strategyId,
    agentType: 'general',
    autonomyMode: 'auto_publish',
    brandId,
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
    organizationId,
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
    userId: 'test-object-id',
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
      createReport: vi.fn().mockResolvedValue({ id: 'report-id' }),
      listByStrategy: vi.fn().mockResolvedValue([]),
    };
    const activitiesService = {
      create: vi.fn().mockResolvedValue({ id: 'activity-id' }),
    };
    const trendsService = {
      getTrends: vi.fn().mockResolvedValue([]),
    };
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
        id: credentialId,
        platform: 'twitter',
      }),
    };
    const postsService = {
      create: vi.fn().mockResolvedValue({ id: postId }),
    };
    const batchGenerationService = {
      createManualReviewBatch: vi.fn().mockResolvedValue({
        id: 'batch-1',
        items: [
          {
            id: reviewItemId,
            postId: reviewPostId,
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

    const performanceService = new AgentStrategyAutopilotPerformanceService(
      agentStrategiesService as never,
      reportsService as never,
      contentDraftsService as never,
      opportunitiesService as never,
      contentPerformanceService as never,
      performanceSummaryService as never,
    );
    const planningService = new AgentStrategyAutopilotPlanningService(
      opportunitiesService as never,
      trendsService as never,
      performanceService,
    );
    const executionService = new AgentStrategyAutopilotExecutionService(
      opportunitiesService as never,
      activitiesService as never,
      contentGatewayService as never,
      contentDraftsService as never,
      optimizersService as never,
      evaluationsOperationsService as never,
      credentialsService as never,
      postsService as never,
      batchGenerationService as never,
      logger as never,
    );

    const service = new AgentStrategyAutopilotService(
      agentStrategiesService as never,
      opportunitiesService as never,
      performanceService,
      planningService,
      executionService,
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
        id: opportunityId,
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
      organizationId,
      runId: 'run-1',
      strategyId,
      userId,
    });

    expect(result.creditsUsed).toBe(0);
    expect(
      deps.contentGatewayService.processManualRequest,
    ).not.toHaveBeenCalled();
  });

  it('revises a weak post once and discards it when the revised version still fails', async () => {
    const deps = createService();

    deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([
      {
        id: opportunityId,
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
          id: draftId,
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
      organizationId,
      runId: 'run-1',
      strategyId,
      userId,
    });

    expect(result.contentGenerated).toBe(1);
    expect(deps.optimizersService.optimizeContent).toHaveBeenCalledTimes(1);
    expect(deps.contentDraftsService.patch).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({
        metadata: expect.objectContaining({
          autopilotOpportunityId: opportunityId,
          autopilotStrategyId: strategyId,
        }),
      }),
    );
    expect(deps.contentDraftsService.reject).toHaveBeenCalledTimes(1);
    expect(deps.contentDraftsService.reject).toHaveBeenCalledWith(
      draftId,
      organizationId,
      expect.any(String),
    );
    expect(deps.opportunitiesService.updateStatus).toHaveBeenCalledWith(
      opportunityId,
      organizationId,
      'discarded',
      expect.objectContaining({ decisionReason: expect.any(String) }),
    );
    expect(deps.reportsService.createReport).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, strategyId }),
    );
    expect(deps.postsService.create).not.toHaveBeenCalled();
  });

  it('holds a low-scoring image without auto-publishing it', async () => {
    const deps = createService();

    deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([
      {
        id: opportunityId,
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
          id: draftId,
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
      organizationId,
      runId: 'run-1',
      strategyId,
      userId,
    });

    expect(deps.contentDraftsService.reject).toHaveBeenCalledTimes(1);
    expect(deps.contentDraftsService.reject).toHaveBeenCalledWith(
      draftId,
      organizationId,
      expect.any(String),
    );
    expect(deps.opportunitiesService.updateStatus).toHaveBeenCalledWith(
      opportunityId,
      organizationId,
      'held',
      expect.objectContaining({ decisionReason: expect.any(String) }),
    );
    expect(deps.postsService.create).not.toHaveBeenCalled();
  });

  it('hands off a strong image to the manual review queue', async () => {
    const deps = createService();

    deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([
      {
        id: opportunityId,
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
          id: draftId,
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
      organizationId,
      runId: 'run-1',
      strategyId,
      userId,
    });

    expect(deps.contentDraftsService.approve).toHaveBeenCalledTimes(1);
    expect(deps.contentDraftsService.approve).toHaveBeenCalledWith(
      draftId,
      organizationId,
      userId,
    );
    expect(
      deps.batchGenerationService.createManualReviewBatch,
    ).toHaveBeenCalledTimes(1);
    expect(
      deps.batchGenerationService.createManualReviewBatch,
    ).toHaveBeenCalledWith(
      {
        brandId,
        items: [
          expect.objectContaining({
            gateOverallScore: 91,
            gateReasons: ['Image cleared the autopilot quality gate.'],
            opportunitySourceType: 'trend',
            opportunityTopic: 'Product hero',
            sourceActionId: opportunityId,
            sourceWorkflowId: strategyId,
          }),
        ],
      },
      userId,
      organizationId,
    );
    expect(deps.contentDraftsService.patch).toHaveBeenCalledWith(draftId, {
      metadata: {
        reviewBatchId: 'batch-1',
        reviewItemId,
        reviewPostId,
      },
    });
    expect(deps.activitiesService.create).toHaveBeenCalledTimes(1);
    expect(deps.activitiesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId,
        entityId: reviewPostId,
        organizationId,
        userId,
      }),
    );
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
        id: opportunityId,
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
          id: draftId,
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
      organizationId,
      runId: 'run-1',
      strategyId,
      userId,
    });

    expect(deps.contentDraftsService.approve).toHaveBeenCalledTimes(1);
    expect(deps.contentDraftsService.approve).toHaveBeenCalledWith(
      draftId,
      organizationId,
      userId,
    );
    expect(
      deps.batchGenerationService.createManualReviewBatch,
    ).toHaveBeenCalledTimes(1);
    expect(
      deps.batchGenerationService.createManualReviewBatch,
    ).toHaveBeenCalledWith(
      {
        brandId,
        items: [
          expect.objectContaining({
            gateOverallScore: 88,
            gateReasons: [
              'Post cleared the autopilot quality gate.',
              'Draft includes a visible call-to-action for traffic intent.',
            ],
            opportunitySourceType: 'evergreen',
            opportunityTopic: 'AI hooks',
            sourceActionId: opportunityId,
            sourceWorkflowId: strategyId,
          }),
        ],
      },
      userId,
      organizationId,
    );
    expect(deps.contentDraftsService.patch).toHaveBeenCalledWith(draftId, {
      metadata: {
        reviewBatchId: 'batch-1',
        reviewItemId,
        reviewPostId,
      },
    });
    expect(deps.activitiesService.create).toHaveBeenCalledTimes(1);
    expect(deps.activitiesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId,
        entityId: reviewPostId,
        organizationId,
        userId,
      }),
    );
    expect(deps.postsService.create).not.toHaveBeenCalled();
  });

  it('falls back to the manual review queue when auto-publish cannot find a credential', async () => {
    const deps = createService();

    deps.credentialsService.findOne.mockResolvedValue(null);
    deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([
      {
        id: opportunityId,
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
          id: draftId,
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
      organizationId,
      runId: 'run-1',
      strategyId,
      userId,
    });

    expect(deps.contentDraftsService.approve).toHaveBeenCalledTimes(1);
    expect(deps.contentDraftsService.approve).toHaveBeenCalledWith(
      draftId,
      organizationId,
      userId,
    );
    expect(
      deps.batchGenerationService.createManualReviewBatch,
    ).toHaveBeenCalledTimes(1);
    expect(
      deps.batchGenerationService.createManualReviewBatch,
    ).toHaveBeenCalledWith(
      {
        brandId,
        items: [
          expect.objectContaining({
            gateOverallScore: 88,
            gateReasons: [
              'Post cleared the autopilot quality gate.',
              'Draft includes a visible call-to-action for traffic intent.',
            ],
            opportunitySourceType: 'evergreen',
            opportunityTopic: 'AI hooks',
            sourceActionId: opportunityId,
            sourceWorkflowId: strategyId,
          }),
        ],
      },
      userId,
      organizationId,
    );
    expect(deps.contentDraftsService.patch).toHaveBeenCalledWith(draftId, {
      metadata: {
        reviewBatchId: 'batch-1',
        reviewItemId,
        reviewPostId,
      },
    });
    expect(deps.activitiesService.create).toHaveBeenCalledTimes(1);
    expect(deps.activitiesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId,
        entityId: reviewPostId,
        organizationId,
        userId,
      }),
    );
    expect(deps.postsService.create).not.toHaveBeenCalled();
  });

  it('auto-publishes a strong text draft when a connected credential exists', async () => {
    const deps = createService();

    deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([
      {
        id: opportunityId,
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
          id: draftId,
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

    const result = await deps.service.executeQueuedRun({
      organizationId,
      runId: 'run-1',
      strategyId,
      userId,
    });

    expect(result.contentGenerated).toBe(1);
    expect(deps.credentialsService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId,
        isConnected: true,
        isDeleted: false,
        organizationId,
        platform: 'twitter',
      }),
    );
    expect(deps.postsService.create).toHaveBeenCalledTimes(1);
    expect(deps.postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId,
        credentialId,
        description: 'Strong post draft',
        organizationId,
        platform: 'twitter',
        userId,
      }),
    );
    expect(deps.contentDraftsService.patch).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({
        metadata: { publishedPostIds: [postId] },
      }),
    );
    expect(deps.opportunitiesService.updateStatus).toHaveBeenCalledWith(
      opportunityId,
      organizationId,
      'published',
      expect.objectContaining({ decisionReason: expect.any(String) }),
    );
    expect(deps.contentDraftsService.approve).not.toHaveBeenCalled();
    expect(
      deps.batchGenerationService.createManualReviewBatch,
    ).not.toHaveBeenCalled();
  });
});
