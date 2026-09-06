import { AgentStrategyAutopilotService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.service';
import { AgentStrategyAutopilotExecutionService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-execution.service';
import { AgentStrategyAutopilotPerformanceService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-performance.service';
import { AgentStrategyAutopilotPlanningService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-planning.service';
import type { PostAccountTarget } from '@api/collections/posts/services/post-account-fanout.service';
import { AgentAutonomyMode, Platform } from '@genfeedai/contracts';

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
    autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
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
      claimForGeneration: vi.fn().mockResolvedValue(true),
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
      fetchAndCachePlatformTrends: vi.fn().mockResolvedValue([]),
    };
    const contentGatewayService = {
      processManualRequest: vi.fn(),
    };
    const optimizersService = {
      analyzeContent: vi.fn(),
      optimizeContent: vi.fn(),
    };
    const evaluationsOperationsService = {
      evaluateImage: vi.fn(),
    };
    // Auto-publish addresses accounts, not platforms: the fan-out service is
    // the only thing that knows how many accounts a brand holds on a platform.
    const postAccountFanoutService = {
      resolveTargets: vi.fn().mockImplementation(
        async (input: { caption: string }): Promise<PostAccountTarget[]> => [
          {
            caption: input.caption,
            credentialId,
            platform: Platform.TWITTER,
          },
        ],
      ),
    };
    const postsService = {
      create: vi.fn().mockResolvedValue({ id: postId }),
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue({
        id: draftId,
        targetSettings: { generation: { metadata: {} } },
      }),
      patch: vi.fn().mockResolvedValue({ id: draftId }),
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
      find: vi.fn().mockResolvedValue([]),
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
      postsService as never,
      opportunitiesService as never,
      contentPerformanceService as never,
    );
    const planningService = new AgentStrategyAutopilotPlanningService(
      opportunitiesService as never,
      trendsService as never,
      performanceService,
      logger as never,
    );
    const executionService = new AgentStrategyAutopilotExecutionService(
      opportunitiesService as never,
      activitiesService as never,
      contentGatewayService as never,
      optimizersService as never,
      evaluationsOperationsService as never,
      postsService as never,
      postAccountFanoutService as never,
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
      contentPerformanceService,
      planningService,
      performanceService,
      logger,
      trendsService,
      agentStrategiesService,
      batchGenerationService,
      contentGatewayService,
      evaluationsOperationsService,
      opportunitiesService,
      optimizersService,
      postAccountFanoutService,
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
      posts: [
        {
          description: 'Weak draft',
          id: draftId,
          targetAttachments: [],
          targetSettings: { generation: { metadata: {} } },
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
    expect(deps.postsService.patch).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({
        targetSettings: expect.any(Object),
      }),
    );
    expect(deps.postsService.patch).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({
        reviewDecision: 'REJECTED',
        reviewFeedback: expect.any(String),
      }),
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
      posts: [
        {
          description: 'Generated image',
          id: draftId,
          targetAttachments: ['https://cdn.example.com/image.png'],
          targetSettings: { generation: { metadata: {} } },
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

    expect(deps.postsService.patch).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({
        reviewDecision: 'REJECTED',
        reviewFeedback: expect.any(String),
      }),
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
      posts: [
        {
          description: 'Generated image',
          id: draftId,
          targetAttachments: ['https://cdn.example.com/image.png'],
          targetSettings: { generation: { metadata: {} } },
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
            postId: draftId,
            sourceActionId: opportunityId,
            sourceWorkflowId: strategyId,
          }),
        ],
      },
      userId,
      organizationId,
    );
    expect(deps.postsService.patch).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({ targetSettings: expect.any(Object) }),
    );
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
      autonomyMode: AgentAutonomyMode.SUPERVISED,
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
      posts: [
        {
          description: 'Strong post draft',
          id: draftId,
          targetAttachments: [],
          targetSettings: { generation: { metadata: {} } },
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
            postId: draftId,
            sourceActionId: opportunityId,
            sourceWorkflowId: strategyId,
          }),
        ],
      },
      userId,
      organizationId,
    );
    expect(deps.postsService.patch).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({ targetSettings: expect.any(Object) }),
    );
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

    deps.postAccountFanoutService.resolveTargets.mockResolvedValue([]);
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
      posts: [
        {
          description: 'Strong post draft',
          id: draftId,
          targetAttachments: [],
          targetSettings: { generation: { metadata: {} } },
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
            postId: draftId,
            sourceActionId: opportunityId,
            sourceWorkflowId: strategyId,
          }),
        ],
      },
      userId,
      organizationId,
    );
    expect(deps.postsService.patch).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({ targetSettings: expect.any(Object) }),
    );
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
      posts: [
        {
          description: 'Strong post draft',
          id: draftId,
          targetAttachments: [],
          targetSettings: { generation: { metadata: {} } },
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
    expect(deps.postAccountFanoutService.resolveTargets).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId,
        organizationId,
        platforms: [Platform.TWITTER],
      }),
    );
    expect(deps.postsService.create).not.toHaveBeenCalled();
    expect(deps.postsService.patch).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({
        credentialId,
        platform: Platform.TWITTER,
      }),
    );
    expect(deps.opportunitiesService.updateStatus).toHaveBeenCalledWith(
      opportunityId,
      organizationId,
      'approved',
      expect.objectContaining({ decisionReason: expect.any(String) }),
    );
    expect(
      deps.batchGenerationService.createManualReviewBatch,
    ).not.toHaveBeenCalled();
  });

  it('holds rejected account variations before scheduling any target', async () => {
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
      posts: [
        {
          description: 'Strong post draft',
          id: draftId,
          targetAttachments: [],
          targetSettings: { generation: { metadata: {} } },
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

    deps.optimizersService.analyzeContent
      .mockResolvedValueOnce({
        overallScore: 88,
        metadata: { hasCallToAction: true },
      })
      .mockResolvedValueOnce({
        overallScore: 20,
        metadata: { hasCallToAction: false },
      });
    await expect(
      deps.service.executeQueuedRun({
        organizationId,
        runId: 'run-1',
        strategyId,
        userId,
      }),
    ).rejects.toThrow('Account-specific content failed');

    expect(deps.postsService.create).not.toHaveBeenCalled();
    expect(deps.postsService.patch).not.toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({ targetExecutionState: 'scheduled' }),
    );
    expect(deps.opportunitiesService.updateStatus).toHaveBeenCalledWith(
      opportunityId,
      organizationId,
      'held',
      expect.any(Object),
    );
  });

  it('publishes the revised content after a successful second quality gate', async () => {
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
      posts: [
        {
          description: 'Strong post draft',
          id: draftId,
          targetAttachments: [],
          targetSettings: { generation: { metadata: {} } },
        },
      ],
      runs: ['run-1'],
    });

    deps.optimizersService.optimizeContent.mockResolvedValue({
      optimized: 'Revised winning content',
    });
    deps.optimizersService.analyzeContent
      .mockResolvedValueOnce({
        overallScore: 65,
        metadata: { hasCallToAction: true },
      })
      .mockResolvedValue({
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
    expect(deps.postAccountFanoutService.resolveTargets).toHaveBeenCalledWith(
      expect.objectContaining({ caption: 'Revised winning content' }),
    );
    expect(deps.postsService.patch).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({
        description: 'Revised winning content',
        targetExecutionState: 'scheduled',
      }),
    );
    expect(deps.postAccountFanoutService.resolveTargets).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId,
        organizationId,
        platforms: [Platform.TWITTER],
      }),
    );
    expect(deps.postsService.create).not.toHaveBeenCalled();
    expect(deps.postsService.patch).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({
        credentialId,
        platform: Platform.TWITTER,
      }),
    );
    expect(deps.opportunitiesService.updateStatus).toHaveBeenCalledWith(
      opportunityId,
      organizationId,
      'approved',
      expect.objectContaining({ decisionReason: expect.any(String) }),
    );
    expect(
      deps.batchGenerationService.createManualReviewBatch,
    ).not.toHaveBeenCalled();
  });

  it('publishes one post per connected account, sharing a single group', async () => {
    const deps = createService();

    // Two X accounts on the same brand. Auto-publish is a fan-out, not a
    // lookup, and the siblings carry distinct bodies because platforms
    // suppress identical text posted across related accounts.
    deps.postAccountFanoutService.resolveTargets.mockResolvedValue([
      {
        caption: 'Strong post draft',
        credentialId,
        platform: Platform.TWITTER,
      },
      {
        caption: 'Strong post draft, rephrased',
        credentialId: 'credential-id-2',
        platform: Platform.TWITTER,
      },
    ]);

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
      posts: [
        {
          description: 'Strong post draft',
          id: draftId,
          targetAttachments: [],
          targetSettings: { generation: { metadata: {} } },
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

    // The draft becomes the first account's post; the second is a new row.
    expect(deps.postsService.patch).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({ credentialId, platform: Platform.TWITTER }),
    );
    expect(deps.postsService.create).toHaveBeenCalledTimes(1);
    expect(deps.postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'credential-id-2',
        description: 'Strong post draft, rephrased',
        platform: Platform.TWITTER,
      }),
    );

    // The draft is patched more than once during a run; only the publish call
    // carries a credential, and it is the one that has to share the group.
    const publishPatch = deps.postsService.patch.mock.calls
      .map(
        (call: unknown[]) =>
          call[1] as { credentialId?: string; groupId?: string },
      )
      .find((payload) => payload?.credentialId === credentialId);
    const createdPost = deps.postsService.create.mock.calls[0]?.[0] as {
      groupId?: string;
    };

    expect(publishPatch?.groupId).toEqual(expect.any(String));
    expect(createdPost?.groupId).toBe(publishPatch?.groupId);
  });
  it('renews evergreen opportunities on the next day and rotates topics', async () => {
    vi.useFakeTimers();
    try {
      const deps = createService();
      const strategy = {
        ...baseStrategy,
        topics: ['First', 'Second'],
        opportunitySources: {
          ...baseStrategy.opportunitySources,
          evergreenCadenceEnabled: true,
        },
      };
      deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([]);
      vi.setSystemTime(new Date('2026-09-06T12:00:00Z'));
      await deps.planningService.refreshOpportunities(strategy as never);
      const first = deps.opportunitiesService.createIfMissing.mock.calls[0][0];
      await deps.planningService.refreshOpportunities(strategy as never);
      expect(
        deps.opportunitiesService.createIfMissing.mock.calls[1][0].sourceRef,
      ).toBe(first.sourceRef);
      vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
      await deps.planningService.refreshOpportunities(strategy as never);
      const next = deps.opportunitiesService.createIfMissing.mock.calls[2][0];
      expect(next.sourceRef).not.toBe(first.sourceRef);
      expect(next.topic).not.toBe(first.topic);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not call scheduled posts published or count completed runs as posts', async () => {
    const deps = createService();
    deps.postsService.find.mockResolvedValue([
      {
        id: postId,
        groupId: 'group',
        scheduledDate: new Date(),
        targetExecutionState: 'scheduled',
      },
    ]);
    expect(
      await deps.performanceService.getPublishingCadence(baseStrategy as never),
    ).toEqual({ today: 1, week: 1 });
    deps.postsService.find.mockResolvedValue([]);
    expect(
      await deps.performanceService.getPublishingCadence({
        ...baseStrategy,
        runHistory: [{ completedAt: new Date() }],
      } as never),
    ).toEqual({ today: 0, week: 0 });
  });

  it('uses the requested reporting period and deduplicates cumulative post snapshots', async () => {
    const deps = createService();
    deps.contentPerformanceService.find.mockResolvedValue([
      {
        postId,
        measuredAt: new Date(),
        views: 100,
        clicks: 10,
        performanceScore: 80,
        platform: 'twitter',
        contentType: 'text',
        hookUsed: 'Winner',
      },
      {
        postId,
        measuredAt: new Date(Date.now() - 1000),
        views: 50,
        clicks: 5,
        performanceScore: 70,
        platform: 'twitter',
        contentType: 'text',
      },
    ]);
    await deps.performanceService.generateStrategyReport(
      strategyId,
      organizationId,
      'daily',
    );
    expect(deps.reportsService.createReport).toHaveBeenCalledWith(
      expect.objectContaining({
        impressions: 100,
        clicks: 10,
        visits: null,
        reportType: 'daily',
        topHooks: ['Winner'],
      }),
    );
    expect(deps.contentPerformanceService.find).toHaveBeenCalledWith(
      expect.objectContaining({
        post: expect.objectContaining({
          agentStrategyId: strategyId,
          organizationId,
          isDeleted: false,
        }),
      }),
    );
  });
  it('marks an opportunity published only after every account confirms', async () => {
    const deps = createService();
    deps.opportunitiesService.listByStrategy.mockResolvedValue([
      { id: opportunityId, metadata: { postIds: ['a', 'b'] } },
    ]);
    deps.postsService.find.mockResolvedValue([
      { id: 'a', targetExecutionState: 'published' },
      { id: 'b', targetExecutionState: 'scheduled' },
    ]);
    await deps.performanceService.reconcilePublications(baseStrategy as never);
    expect(deps.opportunitiesService.updateStatus).not.toHaveBeenCalled();
    deps.postsService.find.mockResolvedValue([
      { id: 'a', targetExecutionState: 'published' },
      { id: 'b', targetExecutionState: 'published' },
    ]);
    await deps.performanceService.reconcilePublications(baseStrategy as never);
    expect(deps.opportunitiesService.updateStatus).toHaveBeenCalledWith(
      opportunityId,
      organizationId,
      'published',
      expect.any(Object),
    );
  });
  it.each([
    ['2026-03-08T05:00:00Z', '2026-03-09T04:00:00.000Z'],
    ['2026-11-01T04:00:00Z', '2026-11-02T05:00:00.000Z'],
    ['2026-09-07T02:00:00Z', '2026-09-07T04:00:00.000Z'],
  ])(
    'expires daily opportunities at the next local midnight across DST (%s)',
    async (now, midnight) => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date(now));
        const deps = createService();
        deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([]);
        await deps.planningService.refreshOpportunities({
          ...baseStrategy,
          timezone: 'America/New_York',
          opportunitySources: {
            ...baseStrategy.opportunitySources,
            evergreenCadenceEnabled: true,
          },
        } as never);
        expect(deps.opportunitiesService.createIfMissing).toHaveBeenCalledWith(
          expect.objectContaining({ expiresAt: new Date(midnight) }),
        );
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("does not select yesterday's budget-blocked daily opportunity", () => {
    const deps = createService();
    const opportunity = {
      id: opportunityId,
      status: 'queued',
      expiresAt: new Date(Date.now() - 1),
      estimatedCreditCost: 1,
      formatCandidates: ['text'],
      sourceType: 'evergreen',
      priorityScore: 90,
    };
    expect(
      deps.planningService.selectOpportunities(
        baseStrategy as never,
        [opportunity] as never,
        deps.planningService.computeBudgetPacingState(baseStrategy as never),
      ),
    ).toEqual([]);
  });

  it('logs trend provider failure and still creates the evergreen fallback', async () => {
    const deps = createService();
    deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([]);
    deps.trendsService.fetchAndCachePlatformTrends.mockRejectedValue(
      new Error('Provider unavailable'),
    );
    await deps.planningService.refreshOpportunities(
      {
        ...baseStrategy,
        opportunitySources: {
          ...baseStrategy.opportunitySources,
          evergreenCadenceEnabled: true,
          trendWatchersEnabled: true,
        },
      } as never,
      true,
    );
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('trend refresh failed'),
      expect.objectContaining({
        organizationId,
        strategyId,
        platform: 'twitter',
      }),
    );
    expect(deps.opportunitiesService.createIfMissing).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'evergreen' }),
    );
  });
});
