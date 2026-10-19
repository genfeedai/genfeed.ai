import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { AgentStrategyAutopilotService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.service';
import { AgentStrategyAutopilotExecutionService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-execution.service';
import { AgentStrategyAutopilotPerformanceService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-performance.service';
import { AgentStrategyAutopilotPlanningService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-planning.service';
import type { PostAccountTarget } from '@api/collections/posts/services/post-account-fanout.service';
import { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import {
  AgentAutonomyMode,
  Platform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { createDefaultBrandPublishPolicy } from '@genfeedai/contracts/api-types/contracts/brand-publish-policy.contract';
import { applyExpertPublishApprovalDefault } from '@genfeedai/contracts/constants';

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
      minImageScore: 75,
      minPostScore: 70,
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
      record: vi.fn().mockResolvedValue({ id: 'activity-id' }),
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
      resolveDefaultTarget: vi.fn().mockImplementation(
        async (input: { caption: string }): Promise<PostAccountTarget> => ({
          caption: input.caption,
          credentialId,
          platform: Platform.TWITTER,
        }),
      ),
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
      findAll: vi
        .fn()
        .mockResolvedValue({ docs: [], totalDocs: 0, hasNextPage: false }),
      findOne: vi.fn().mockResolvedValue({
        id: draftId,
        targetSettings: { generation: { metadata: {} } },
      }),
      getChildren: vi.fn().mockResolvedValue([]),
      patch: vi.fn().mockResolvedValue({ id: draftId }),
    };
    const turboRunService = {
      createManualReviewTurboRun: vi.fn().mockResolvedValue({
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
      findAll: vi
        .fn()
        .mockResolvedValue({ docs: [], totalDocs: 0, hasNextPage: false }),
    };
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    // The real shared publish policy over the rows it reads, so a test can
    // withhold brand or channel permission exactly as production stores it.
    const policyDb = {
      agentStrategy: {
        findFirst: vi.fn().mockResolvedValue({
          id: strategyId,
          brandId,
          config: { autonomyMode: baseStrategy.autonomyMode },
          isActive: true,
          policies: { publishPolicy: baseStrategy.publishPolicy },
        }),
      },
      brand: {
        findFirst: vi.fn().mockResolvedValue({
          agentConfig: { autoPublish: { enabled: true } },
        }),
      },
      credential: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: credentialId, platform: 'TWITTER' }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      persona: { findFirst: vi.fn().mockResolvedValue(null) },
      // The brand's approved Brand OS Policy (#7339), opening text to the streak.
      brandOsRevision: {
        findFirst: vi.fn().mockResolvedValue({
          content: { policy: createDefaultBrandPublishPolicy() },
        }),
      },
      ingredient: { findMany: vi.fn().mockResolvedValue([]) },
      profile: { findMany: vi.fn().mockResolvedValue([]) },
      $executeRaw: vi.fn().mockResolvedValue(0),
    };
    const autonomousPublishPolicy = new AutonomousPublishPolicyService(
      policyDb as never,
      activitiesService as never,
    );

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
      turboRunService as never,
      autonomousPublishPolicy,
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
      turboRunService,
      contentGatewayService,
      evaluationsOperationsService,
      opportunitiesService,
      optimizersService,
      policyDb,
      postAccountFanoutService,
      postsService,
      reportsService,
      service,
    };
  }

  function queueStrongTextDraft(deps: ReturnType<typeof createService>) {
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
  }

  function expectReviewHandoffWithoutScheduling(
    deps: ReturnType<typeof createService>,
    reason: string,
  ) {
    expect(deps.postsService.create).not.toHaveBeenCalled();
    expect(deps.postsService.patch).not.toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    );
    expect(
      deps.turboRunService.createManualReviewTurboRun,
    ).toHaveBeenCalledWith(
      {
        agentStrategyId: strategyId,
        brandId,
        items: [expect.objectContaining({ postId: draftId })],
      },
      userId,
      organizationId,
    );
    expect(deps.opportunitiesService.updateStatus).toHaveBeenCalledWith(
      opportunityId,
      organizationId,
      'approved',
      expect.objectContaining({
        decisionReason: expect.stringContaining(reason),
      }),
    );
  }

  it.each([
    ['an Expert Path brand', applyExpertPublishApprovalDefault(undefined)],
    ['a brand requiring approval', { enabled: true, isApprovalRequired: true }],
    ['a brand without auto-publish', undefined],
  ])(
    'routes an auto-publish strategy draft to review for %s',
    async (_label, autoPublish) => {
      const deps = createService();
      deps.policyDb.brand.findFirst.mockResolvedValue({
        agentConfig: { autoPublish },
      });
      queueStrongTextDraft(deps);

      await deps.service.executeQueuedRun({
        organizationId,
        runId: 'run-1',
        strategyId,
        userId,
      });

      expectReviewHandoffWithoutScheduling(
        deps,
        'Brand auto-publish is disabled.',
      );
    },
  );

  it('routes a draft to review when its channel was reverted to supervised', async () => {
    const deps = createService();
    deps.policyDb.agentStrategy.findFirst.mockResolvedValue({
      id: strategyId,
      brandId,
      config: { autonomyMode: AgentAutonomyMode.AUTO_PUBLISH },
      isActive: true,
      policies: {
        publishPolicy: {
          ...baseStrategy.publishPolicy,
          platformStates: {
            [Platform.TWITTER]: {
              approvalStreak: 0,
              autoPublishEnabled: false,
            },
          },
        },
      },
    });
    queueStrongTextDraft(deps);

    await deps.service.executeQueuedRun({
      organizationId,
      runId: 'run-1',
      strategyId,
      userId,
    });

    expectReviewHandoffWithoutScheduling(
      deps,
      'Autonomy mode requires human approval.',
    );
  });

  it('routes a draft below the brand Policy minimum score to review (#7339)', async () => {
    const deps = createService();
    deps.policyDb.brandOsRevision.findFirst.mockResolvedValue({
      content: {
        policy: { ...createDefaultBrandPublishPolicy(), minQualityScore: 99 },
      },
    });
    queueStrongTextDraft(deps);

    await deps.service.executeQueuedRun({
      organizationId,
      runId: 'run-1',
      strategyId,
      userId,
    });

    expectReviewHandoffWithoutScheduling(deps, 'Brand Policy requires review');
    expect(deps.policyDb.$executeRaw).toHaveBeenCalled();
  });

  it('auto-publishes a draft whose gate score meets the brand Policy minimum (#7339)', async () => {
    const deps = createService();
    deps.policyDb.brandOsRevision.findFirst.mockResolvedValue({
      content: {
        policy: { ...createDefaultBrandPublishPolicy(), minQualityScore: 50 },
      },
    });
    queueStrongTextDraft(deps);

    await deps.service.executeQueuedRun({
      organizationId,
      runId: 'run-1',
      strategyId,
      userId,
    });

    expect(
      deps.turboRunService.createManualReviewTurboRun,
    ).not.toHaveBeenCalled();
    expect(deps.postsService.patch).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({ credentialId }),
    );
  });

  it('auto-publishes under the default Policy while the brand has no approved Policy (#7339)', async () => {
    const deps = createService();
    deps.policyDb.brandOsRevision.findFirst.mockResolvedValue(null);
    queueStrongTextDraft(deps);

    await deps.service.executeQueuedRun({
      organizationId,
      runId: 'run-1',
      strategyId,
      userId,
    });

    expect(
      deps.turboRunService.createManualReviewTurboRun,
    ).not.toHaveBeenCalled();
    expect(deps.postsService.patch).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({ credentialId }),
    );
  });

  it('routes a draft to review when the target account is not connected', async () => {
    const deps = createService();
    deps.policyDb.credential.findFirst.mockResolvedValue(null);
    queueStrongTextDraft(deps);

    await deps.service.executeQueuedRun({
      organizationId,
      runId: 'run-1',
      strategyId,
      userId,
    });

    expectReviewHandoffWithoutScheduling(
      deps,
      'Channel auto-publish is disabled.',
    );
  });

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
      deps.turboRunService.createManualReviewTurboRun,
    ).toHaveBeenCalledTimes(1);
    expect(
      deps.turboRunService.createManualReviewTurboRun,
    ).toHaveBeenCalledWith(
      {
        agentStrategyId: strategyId,
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
    expect(deps.activitiesService.record).toHaveBeenCalledTimes(1);
    expect(deps.activitiesService.record).toHaveBeenCalledWith(
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
      deps.turboRunService.createManualReviewTurboRun,
    ).toHaveBeenCalledTimes(1);
    expect(
      deps.turboRunService.createManualReviewTurboRun,
    ).toHaveBeenCalledWith(
      {
        agentStrategyId: strategyId,
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
    expect(deps.activitiesService.record).toHaveBeenCalledTimes(1);
    expect(deps.activitiesService.record).toHaveBeenCalledWith(
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
      deps.turboRunService.createManualReviewTurboRun,
    ).toHaveBeenCalledTimes(1);
    expect(
      deps.turboRunService.createManualReviewTurboRun,
    ).toHaveBeenCalledWith(
      {
        agentStrategyId: strategyId,
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
    expect(deps.activitiesService.record).toHaveBeenCalledTimes(1);
    expect(deps.activitiesService.record).toHaveBeenCalledWith(
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
      deps.turboRunService.createManualReviewTurboRun,
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
      deps.turboRunService.createManualReviewTurboRun,
    ).not.toHaveBeenCalled();
  });

  function queueOverLengthXDraft(deps: ReturnType<typeof createService>) {
    queueStrongTextDraft(deps);
    deps.contentGatewayService.processManualRequest.mockResolvedValue({
      posts: [
        {
          description: `Hook line. ${'a'.repeat(300)}`,
          id: draftId,
          targetAttachments: [],
          targetSettings: { generation: { metadata: {} } },
        },
      ],
      runs: ['run-1'],
    });
  }

  it('shortens an over-length X draft once and publishes the version that fits', async () => {
    const deps = createService();
    queueOverLengthXDraft(deps);
    deps.optimizersService.optimizeContent.mockResolvedValue({
      optimized: 'Hook line. Short enough for X. Reply below.',
    });

    const result = await deps.service.executeQueuedRun({
      organizationId,
      runId: 'run-1',
      strategyId,
      userId,
    });

    expect(result.contentGenerated).toBe(1);
    expect(deps.optimizersService.optimizeContent).toHaveBeenCalledTimes(1);
    expect(deps.optimizersService.optimizeContent).toHaveBeenCalledWith(
      expect.objectContaining({ maxLength: 280, platform: 'twitter' }),
      organizationId,
      userId,
    );
    expect(deps.postAccountFanoutService.resolveTargets).toHaveBeenCalledTimes(
      1,
    );
    expect(deps.postAccountFanoutService.resolveTargets).toHaveBeenCalledWith(
      expect.objectContaining({
        caption: 'Hook line. Short enough for X. Reply below.',
      }),
    );
  });

  it('holds an X draft that is still over-length after the rewrite for review instead of failing the run', async () => {
    const deps = createService();
    queueOverLengthXDraft(deps);
    deps.optimizersService.optimizeContent.mockResolvedValue({
      optimized: `Still long. ${'b'.repeat(300)}`,
    });

    const result = await deps.service.executeQueuedRun({
      organizationId,
      runId: 'run-1',
      strategyId,
      userId,
    });

    expect(result.contentGenerated).toBe(1);
    expect(deps.optimizersService.optimizeContent).toHaveBeenCalledTimes(1);
    expect(deps.postAccountFanoutService.resolveTargets).not.toHaveBeenCalled();
    expect(deps.postsService.patch).not.toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({ reviewDecision: 'REJECTED' }),
    );
    expect(
      deps.turboRunService.createManualReviewTurboRun,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            caption: `Still long. ${'b'.repeat(300)}`,
            platform: 'twitter',
            postId: draftId,
          }),
        ],
      }),
      userId,
      organizationId,
    );
    expect(deps.opportunitiesService.updateStatus).toHaveBeenCalledWith(
      opportunityId,
      organizationId,
      'approved',
      expect.objectContaining({
        decisionReason: expect.stringContaining(
          'the twitter limit is 280. Handed off to publishing inbox batch batch-1 to shorten',
        ),
      }),
    );
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

  describe('default X cadence', () => {
    const defaultXStrategy = {
      ...baseStrategy,
      postsPerWeek: undefined,
      platforms: ['twitter'],
      opportunitySources: {
        ...baseStrategy.opportunitySources,
        evergreenCadenceEnabled: true,
        trendWatchersEnabled: true,
      },
    };

    it('plans two distinct evergreen items a day at the default cadence', async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-09-06T12:00:00Z'));
        const deps = createService();
        deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([]);
        const strategy = { ...defaultXStrategy, topics: ['AI hooks'] };
        await deps.planningService.refreshOpportunities(strategy as never);
        await deps.planningService.refreshOpportunities(strategy as never);
        const evergreen = deps.opportunitiesService.createIfMissing.mock.calls
          .map(([input]) => input)
          .filter((input) => input.sourceType === 'evergreen');
        const refs = new Set(evergreen.map((input) => input.sourceRef));
        expect(refs.size).toBe(2);
        expect(evergreen).toHaveLength(4);
      } finally {
        vi.useRealTimers();
      }
    });

    it('rotates topics across the daily slots', async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-09-06T12:00:00Z'));
        const deps = createService();
        deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([]);
        await deps.planningService.refreshOpportunities({
          ...defaultXStrategy,
          topics: ['First', 'Second'],
        } as never);
        const topics = deps.opportunitiesService.createIfMissing.mock.calls
          .map(([input]) => input)
          .filter((input) => input.sourceType === 'evergreen')
          .map((input) => input.topic);
        expect(new Set(topics)).toEqual(new Set(['First', 'Second']));
      } finally {
        vi.useRealTimers();
      }
    });

    it('stops planning evergreen once two posts are out today', async () => {
      const deps = createService();
      deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([]);
      deps.postsService.find.mockResolvedValue([
        { id: 'a', publishedAt: new Date(), targetExecutionState: 'published' },
        { id: 'b', publishedAt: new Date(), targetExecutionState: 'published' },
      ]);
      await deps.planningService.refreshOpportunities(
        defaultXStrategy as never,
      );
      expect(deps.opportunitiesService.createIfMissing).not.toHaveBeenCalled();
    });

    it('keeps an explicit 0 cadence from planning evergreen items', async () => {
      const deps = createService();
      deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([]);
      await deps.planningService.refreshOpportunities({
        ...defaultXStrategy,
        postsPerWeek: 0,
      } as never);
      expect(deps.opportunitiesService.createIfMissing).not.toHaveBeenCalled();
    });

    it('runs two opportunities a day at the default cadence', async () => {
      const deps = createService();
      deps.agentStrategiesService.findOneById.mockResolvedValue(
        defaultXStrategy,
      );
      deps.opportunitiesService.listOpenByStrategy.mockResolvedValue(
        ['one', 'two', 'three'].map((id) => ({
          id,
          estimatedCreditCost: 1,
          formatCandidates: ['text'],
          platformCandidates: ['twitter'],
          priorityScore: 90,
          sourceType: 'evergreen',
          status: 'queued',
          topic: id,
        })),
      );
      const execute = vi
        .spyOn(
          AgentStrategyAutopilotExecutionService.prototype,
          'executeOpportunity',
        )
        .mockResolvedValue({ contentGenerated: 1, creditsUsed: 0 });
      try {
        const result = await deps.service.executeQueuedRun({
          organizationId,
          strategyId,
          userId,
          runId: 'run',
        });
        expect(execute).toHaveBeenCalledTimes(2);
        expect(result.contentGenerated).toBe(2);
      } finally {
        execute.mockRestore();
      }
    });
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

  it('counts future schedules in the configured local week and counts fan-out once', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
      const deps = createService();
      deps.postsService.findAll
        .mockResolvedValueOnce({
          docs: [
            {
              id: 'first',
              groupId: 'group',
              scheduledDate: new Date('2026-10-10T12:00:00Z'),
            },
            {
              id: 'sibling',
              groupId: 'group',
              scheduledDate: new Date('2026-10-10T12:00:00Z'),
            },
          ],
          hasNextPage: false,
        })
        .mockResolvedValueOnce({ docs: [], hasNextPage: false });
      const status = await deps.performanceService.getCadenceStatus({
        ...baseStrategy,
        publishingCeilingPerWeek: 14,
        readyDraftReserve: 3,
        timezone: 'Europe/Malta',
      } as unknown as AgentStrategyDocument);
      expect(status).toMatchObject({
        week: 1,
        readyDrafts: 0,
        publicationSlots: 13,
        postingShortfall: 2,
        reserveShortfall: 3,
      });
      expect(deps.postsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId,
            isDeleted: false,
            brandId,
            parentId: null,
          }),
        }),
        expect.any(Object),
        false,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps reserve generation in review when automatic publication is permitted', async () => {
    const deps = createService();
    deps.agentStrategiesService.findOneById.mockResolvedValue({
      ...baseStrategy,
      postsPerWeek: 1,
      publishingCeilingPerWeek: 7,
      readyDraftReserve: 2,
    });
    deps.postsService.findAll.mockImplementation(
      async (input: { where?: { targetExecutionState?: unknown } }) => ({
        docs:
          typeof input.where?.targetExecutionState === 'object'
            ? [{ id: 'scheduled', scheduledDate: new Date() }]
            : [],
        totalDocs: 1,
        hasNextPage: false,
      }),
    );
    deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([
      {
        id: opportunityId,
        estimatedCreditCost: 10,
        formatCandidates: ['text'],
        platformCandidates: ['twitter'],
        priorityScore: 90,
        sourceType: 'evergreen',
        status: 'queued',
        topic: 'Useful topic',
      },
    ]);
    deps.optimizersService.analyzeContent.mockResolvedValue({
      overallScore: 90,
      metadata: { hasCallToAction: true },
    });
    const draftGenerator = vi.fn().mockResolvedValue({
      draft: {
        id: draftId,
        description: 'Reply with your experience',
        targetSettings: { generation: { metadata: {} } },
      },
      creditsUsed: 2,
    });
    const result = await deps.service.executeQueuedRun({
      organizationId,
      strategyId,
      userId,
      runId: 'run',
      creditBudget: 10,
      draftGenerator,
    });
    expect(result).toMatchObject({ contentGenerated: 1, creditsUsed: 2 });
    expect(
      deps.contentGatewayService.processManualRequest,
    ).not.toHaveBeenCalled();
    expect(deps.postAccountFanoutService.resolveTargets).not.toHaveBeenCalled();
    expect(
      deps.turboRunService.createManualReviewTurboRun,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ agentStrategyId: strategyId }),
      userId,
      organizationId,
    );
  });

  function cadenceStrategy() {
    return {
      ...baseStrategy,
      postsPerWeek: 1,
      publishingCeilingPerWeek: 7,
      readyDraftReserve: 2,
    };
  }

  it('dispatches a cadence video opportunity and always hands the draft to review', async () => {
    const deps = createService();
    deps.agentStrategiesService.findOneById.mockResolvedValue(
      cadenceStrategy(),
    );
    deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([
      {
        id: opportunityId,
        estimatedCreditCost: 40,
        formatCandidates: ['video'],
        platformCandidates: ['twitter'],
        priorityScore: 90,
        sourceType: 'evergreen',
        status: 'queued',
        topic: 'Launch teaser',
      },
    ]);
    const draftGenerator = vi.fn().mockResolvedValue({
      draft: {
        id: draftId,
        description: 'Watch the teaser',
        targetAttachments: ['https://cdn.example/video.mp4'],
        targetSettings: { generation: { metadata: {} } },
      },
      creditsUsed: 32,
    });
    const result = await deps.service.executeQueuedRun({
      organizationId,
      strategyId,
      userId,
      runId: 'run',
      creditBudget: 100,
      draftGenerator,
    });
    expect(draftGenerator).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'video' }),
    );
    expect(result).toMatchObject({ contentGenerated: 1, creditsUsed: 32 });
    expect(deps.optimizersService.analyzeContent).not.toHaveBeenCalled();
    expect(deps.postAccountFanoutService.resolveTargets).not.toHaveBeenCalled();
    expect(
      deps.turboRunService.createManualReviewTurboRun,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            format: 'video',
            mediaUrl: 'https://cdn.example/video.mp4',
            postId: draftId,
          }),
        ],
      }),
      userId,
      organizationId,
    );
    expect(deps.opportunitiesService.updateStatus).toHaveBeenCalledWith(
      opportunityId,
      organizationId,
      'approved',
      expect.objectContaining({
        decisionReason: expect.stringContaining('requires human review'),
      }),
    );
  });

  it('records the generator hold reason when no draft is produced', async () => {
    const deps = createService();
    deps.agentStrategiesService.findOneById.mockResolvedValue(
      cadenceStrategy(),
    );
    deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([
      {
        id: opportunityId,
        estimatedCreditCost: 24,
        formatCandidates: ['image'],
        platformCandidates: ['twitter'],
        priorityScore: 90,
        sourceType: 'evergreen',
        status: 'queued',
        topic: 'Product shot',
      },
    ]);
    const draftGenerator = vi.fn().mockResolvedValue({
      creditsUsed: 0,
      heldReason: 'The image quote exceeds the remaining run budget.',
    });
    await deps.service.executeQueuedRun({
      organizationId,
      strategyId,
      userId,
      runId: 'run',
      creditBudget: 100,
      draftGenerator,
    });
    expect(deps.opportunitiesService.updateStatus).toHaveBeenCalledWith(
      opportunityId,
      organizationId,
      'held',
      {
        decisionReason: 'The image quote exceeds the remaining run budget.',
      },
    );
  });

  it('keeps video out of legacy runs that have no priced generator', async () => {
    const deps = createService();
    deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([
      {
        id: opportunityId,
        estimatedCreditCost: 40,
        formatCandidates: ['video'],
        platformCandidates: ['twitter'],
        priorityScore: 90,
        sourceType: 'evergreen',
        status: 'queued',
        topic: 'Launch teaser',
      },
    ]);
    const result = await deps.service.executeQueuedRun({
      organizationId,
      strategyId,
      userId,
      runId: 'run',
    });
    expect(result.contentGenerated).toBe(0);
    expect(deps.opportunitiesService.claimForGeneration).not.toHaveBeenCalled();
  });

  it('stops generation when scheduled and pending supply cover both minimums', async () => {
    const deps = createService();
    deps.agentStrategiesService.findOneById.mockResolvedValue({
      ...baseStrategy,
      postsPerWeek: 1,
      publishingCeilingPerWeek: 7,
      readyDraftReserve: 1,
    });
    deps.opportunitiesService.listByStrategy.mockImplementation(
      async (_id: string, _org: string, input: { statuses: string[] }) =>
        input.statuses.includes('generating')
          ? [{ id: 'pending', status: 'generating' }]
          : [],
    );
    deps.postsService.findAll.mockImplementation(
      async (input: { where?: { targetExecutionState?: unknown } }) => ({
        docs:
          typeof input.where?.targetExecutionState === 'object'
            ? [{ id: 'scheduled', scheduledDate: new Date() }]
            : [],
        totalDocs: 1,
        hasNextPage: false,
      }),
    );
    deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([]);
    const draftGenerator = vi.fn();
    await deps.service.executeQueuedRun({
      organizationId,
      strategyId,
      userId,
      runId: 'run',
      creditBudget: 10,
      draftGenerator,
    });
    expect(draftGenerator).not.toHaveBeenCalled();
    expect(deps.opportunitiesService.createIfMissing).not.toHaveBeenCalled();
  });

  it('reuses unchanged account quality and bills adapted captions through the bounded evaluator', async () => {
    const deps = createService();
    deps.agentStrategiesService.findOneById.mockResolvedValue({
      ...baseStrategy,
      publishingCeilingPerWeek: 7,
      readyDraftReserve: 0,
    });
    deps.postAccountFanoutService.resolveTargets.mockResolvedValue([
      {
        caption: 'Strong post draft',
        credentialId,
        platform: Platform.TWITTER,
      },
      {
        caption: 'Adapted post draft',
        credentialId: 'second-account',
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
    const evaluateQuality = vi.fn().mockResolvedValue({
      analysis: { overallScore: 90, metadata: { hasCallToAction: true } },
      creditsUsed: 1,
    });
    const draftGenerator = vi.fn().mockResolvedValue({
      draft: {
        id: draftId,
        description: 'Strong post draft',
        targetSettings: { generation: { metadata: {} } },
      },
      creditsUsed: 2,
      evaluateQuality,
    });
    const result = await deps.service.executeQueuedRun({
      organizationId,
      strategyId,
      userId,
      runId: 'run',
      creditBudget: 10,
      draftGenerator,
    });
    expect(result.creditsUsed).toBe(4);
    expect(evaluateQuality).toHaveBeenCalledTimes(2);
    expect(evaluateQuality).toHaveBeenLastCalledWith(
      'Adapted post draft',
      Platform.TWITTER,
    );
    expect(deps.optimizersService.analyzeContent).not.toHaveBeenCalled();
  });

  function queueCadenceThread(
    deps: ReturnType<typeof createService>,
    replies: string[],
  ) {
    deps.agentStrategiesService.findOneById.mockResolvedValue({
      ...baseStrategy,
      contentMix: { threadPercent: 100 },
      publishingCeilingPerWeek: 7,
      readyDraftReserve: 0,
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
    deps.postsService.getChildren.mockResolvedValue(
      replies.map((description, index) => ({
        description,
        id: `reply-${index + 1}`,
        order: index + 1,
      })),
    );
    const evaluateQuality = vi.fn().mockResolvedValue({
      analysis: { overallScore: 90, metadata: { hasCallToAction: true } },
      creditsUsed: 1,
    });
    const draftGenerator = vi.fn().mockResolvedValue({
      draft: {
        id: draftId,
        description: 'Hook post: reply if this helps',
        targetSettings: { generation: { metadata: {} } },
      },
      creditsUsed: 2,
      evaluateQuality,
    });
    return { draftGenerator, evaluateQuality };
  }

  it('writes an X thread and auto-publishes it from one account as one post', async () => {
    const deps = createService();
    const { draftGenerator } = queueCadenceThread(deps, [
      'Second point',
      'Third point',
    ]);

    const result = await deps.service.executeQueuedRun({
      organizationId,
      strategyId,
      userId,
      runId: 'run',
      creditBudget: 10,
      draftGenerator,
    });

    expect(result).toMatchObject({ contentGenerated: 1 });
    expect(draftGenerator).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'thread', platform: 'twitter' }),
    );
    expect(deps.postsService.getChildren).toHaveBeenCalledWith(
      draftId,
      organizationId,
    );
    expect(deps.postAccountFanoutService.resolveTargets).not.toHaveBeenCalled();
    expect(
      deps.postAccountFanoutService.resolveDefaultTarget,
    ).toHaveBeenCalledWith({
      brandId,
      caption: 'Hook post: reply if this helps\n\nSecond point\n\nThird point',
      organizationId,
      platform: 'twitter',
    });
    expect(deps.postsService.create).not.toHaveBeenCalled();
    expect(deps.postsService.patch).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({
        credentialId,
        platform: Platform.TWITTER,
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    );
    expect(deps.postsService.patch).not.toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({ description: expect.anything() }),
    );
    expect(
      deps.turboRunService.createManualReviewTurboRun,
    ).not.toHaveBeenCalled();
  });

  it('sends an X thread with an over-length reply to review instead of publishing it', async () => {
    const deps = createService();
    const { draftGenerator } = queueCadenceThread(deps, ['a'.repeat(300)]);

    await deps.service.executeQueuedRun({
      organizationId,
      strategyId,
      userId,
      runId: 'run',
      creditBudget: 10,
      draftGenerator,
    });

    expectReviewHandoffWithoutScheduling(
      deps,
      'Thread post 2 is 300 characters',
    );
    expect(
      deps.postAccountFanoutService.resolveDefaultTarget,
    ).not.toHaveBeenCalled();
  });

  it('uses the requested reporting period and deduplicates cumulative post snapshots', async () => {
    const deps = createService();
    deps.contentPerformanceService.findAll.mockResolvedValue({
      totalDocs: 2,
      hasNextPage: false,
      docs: [
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
      ],
    });
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
    expect(deps.contentPerformanceService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          post: expect.objectContaining({
            agentStrategyId: strategyId,
            organizationId,
            isDeleted: false,
          }),
        }),
      }),
      { limit: 250, page: 1, pagination: true },
      false,
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
  it.each([
    [undefined, ['instagram']],
    [0, ['twitter']],
  ])(
    'executes queued opportunities without a positive weekly cadence target (%s, %j)',
    async (postsPerWeek, platforms) => {
      const deps = createService();
      deps.agentStrategiesService.findOneById.mockResolvedValue({
        ...baseStrategy,
        platforms,
        postsPerWeek,
      });
      deps.opportunitiesService.listOpenByStrategy.mockResolvedValue([
        {
          id: opportunityId,
          estimatedCreditCost: 1,
          formatCandidates: ['video'],
          platformCandidates: ['twitter'],
          priorityScore: 90,
          sourceType: 'trend',
          status: 'queued',
          topic: 'Topic',
        },
      ]);
      vi.spyOn(deps.planningService, 'selectOpportunities').mockImplementation(
        (_strategy, opportunities) => opportunities,
      );
      const result = await deps.service.executeQueuedRun({
        organizationId,
        strategyId,
        userId,
        runId: 'run',
      });
      expect(deps.opportunitiesService.claimForGeneration).toHaveBeenCalledWith(
        opportunityId,
        organizationId,
      );
      expect(result.summary).toContain('processed 1 opportunities');
    },
  );

  it('holds an opportunity when one linked post is missing or deleted', async () => {
    const deps = createService();
    deps.opportunitiesService.listByStrategy.mockResolvedValue([
      { id: opportunityId, metadata: { postIds: ['a', 'b'] } },
    ]);
    deps.postsService.find.mockResolvedValue([
      { id: 'a', targetExecutionState: 'published' },
    ]);
    await deps.performanceService.reconcilePublications(baseStrategy as never);
    expect(deps.opportunitiesService.updateStatus).toHaveBeenCalledWith(
      opportunityId,
      organizationId,
      'held',
      expect.objectContaining({
        decisionReason: expect.stringContaining('missing or deleted'),
      }),
    );
  });

  it('bounds report queries and explicitly marks incomplete sampled totals', async () => {
    const deps = createService();
    deps.postsService.findAll.mockResolvedValue({
      docs: [],
      totalDocs: 900,
      hasNextPage: true,
    });
    deps.contentPerformanceService.findAll.mockResolvedValue({
      docs: [],
      totalDocs: 1000,
      hasNextPage: true,
    });
    await deps.performanceService.generateStrategyReport(
      strategyId,
      organizationId,
      'daily',
    );
    expect(deps.postsService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      { limit: 250, page: 1, pagination: true },
      false,
    );
    expect(deps.contentPerformanceService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
      }),
      { limit: 250, page: 1, pagination: true },
      false,
    );
    expect(deps.reportsService.createReport).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          sampling: expect.objectContaining({
            limit: 250,
            matchedPosts: 900,
            matchedMeasurements: 1000,
            truncated: true,
          }),
        }),
        allocationChanges: expect.arrayContaining([
          expect.stringContaining('not complete strategy totals'),
        ]),
      }),
    );
  });
});
