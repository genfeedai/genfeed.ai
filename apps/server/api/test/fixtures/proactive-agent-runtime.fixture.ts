import { randomUUID } from 'node:crypto';
import { AgentArtifactReferenceService } from '@api/agent-artifacts/agent-artifact-reference.service';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AgentStrategyAutopilotPerformanceService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-performance.service';
import { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import { AgentStrategyReportsService } from '@api/collections/agent-strategies/services/agent-strategy-reports.service';
import { AnalyticsSyncService } from '@api/collections/content-performance/services/analytics-sync.service';
import { ContentPerformanceService } from '@api/collections/content-performance/services/content-performance.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  SCHEDULED_POST_ACTION_IDS,
  type ScheduledPostWorkflowInput,
} from '@api/collections/posts/services/scheduled-post-workflow-definition';
import { ScheduledPostWorkflowQueueService } from '@api/collections/posts/services/scheduled-post-workflow-queue.service';
import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { AgentAutopilotWorkflowService } from '@api/collections/workflows/services/agent-autopilot-workflow.service';
import {
  AGENT_RUNTIME_ACTION_IDS,
  buildAgentTurnWorkflowDefinition,
} from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import {
  AUTOMATION_ACTION_IDS,
  AUTOMATION_CHILD_WORKFLOWS,
  buildAgentProactiveWorkflowDefinition,
} from '@api/collections/workflows/services/automation-workflow-definitions';
import { WorkflowEngineConverterService } from '@api/collections/workflows/services/workflow-engine-converter.service';
import {
  type WorkflowExecutionJobData,
  WorkflowExecutionQueueService,
} from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { WorkflowExecutionResult } from '@api/collections/workflows/services/workflow-executor.types';
import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  createVersionedWorkflow,
  hydrateWorkflowDefinition,
} from '@api/collections/workflows/workflow-version-definition';
import {
  WORKFLOW_ENGINE_ADAPTER,
  WORKFLOW_EXECUTOR,
} from '@api/collections/workflows/workflows.tokens';
import { PostLifecycleService } from '@api/post-lifecycle/post-lifecycle.service';
import { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import { BatchGenerationCreationService } from '@api/services/batch-generation/batch-generation-creation.service';
import { BatchGenerationProcessingService } from '@api/services/batch-generation/batch-generation-processing.service';
import { BatchGenerationReviewService } from '@api/services/batch-generation/batch-generation-review.service';
import { BatchGenerationSummaryService } from '@api/services/batch-generation/batch-generation-summary.service';
import { BatchReviewLockService } from '@api/services/batch-generation/batch-review-lock';
import { CacheService } from '@api/services/cache/cache.service';
import { runOwnedRuntimeCleanup } from '@api-test/helpers/proactive-runtime-cleanup';
import {
  AgentAutonomyMode,
  AgentType,
  TargetExecutionState,
  WorkflowExecutionTrigger,
  WorkflowStatus,
} from '@genfeedai/contracts';
import {
  AGENT_TURN_QUEUE,
  PLATFORM_SYSTEM_WORKFLOW_QUEUE,
  WORKFLOW_BACKGROUND_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
} from '@genfeedai/contracts/queue';
import {
  CredentialPlatform,
  PrismaClient,
  toPrismaJson,
} from '@genfeedai/prisma';
import { WorkflowEngine } from '@genfeedai/workflows/engine';
import { createMediaUrlExtension } from '@libs/prisma/media-url.extension';
import { PrismaPg } from '@prisma/adapter-pg';
import { PlatformWorkflowSchedulesService } from '@workers/scheduling/platform-workflow-schedules.service';
import { ScheduledPostDiscoveryService } from '@workers/services/scheduled-post-discovery.service';
import { ScheduledPostExecutionGuardService } from '@workers/services/scheduled-post-execution-guard.service';
import { ScheduledPostWorkflowService } from '@workers/services/scheduled-post-workflow.service';
import { type Job, Queue, QueueEvents, Worker } from 'bullmq';
import Redis from 'ioredis';
import { vi } from 'vitest';
import { assertIsolatedDatabaseUrl } from '../../scripts/assert-isolated-db-url';

type RecordValue = Record<string, unknown>;
export function runtimeRecord(value: unknown): RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}
export function readRuntimeBrief(content: string): RecordValue {
  const json = content
    .split('<agent_brief_json>\n')[1]
    ?.split('\n</agent_brief_json>')[0];
  if (!json) throw new Error('Runtime request is missing its configured brief');
  return runtimeRecord(JSON.parse(json));
}

// Dispatcher/graph/review orchestration harness with real PostgreSQL and Redis.
// Turn actions and the queue-processing bridge are replacements; messages and
// a synthetic debit are fixture-written. This does not prove production turn,
// context assembly, worker execution, or credit reservation/settlement.
function createRuntimePrisma(databaseUrl: string) {
  const base = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  return {
    base,
    prisma: base.$extends(
      createMediaUrlExtension({ cdnUrl: 'http://127.0.0.1' }),
    ),
  };
}

export class ProactiveAgentRuntimeFixture {
  readonly namespace = `4959-runtime-${randomUUID()}`;
  readonly organizationId = `${this.namespace}-org`;
  readonly userId = `${this.namespace}-user`;
  readonly brandId = `${this.namespace}-brand`;
  readonly credentialId = `${this.namespace}-credential`;
  readonly ownedOrganizationIds = new Set([this.organizationId]);
  readonly logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  readonly activity = {
    afterCommit: vi.fn(),
    record: vi.fn(),
    recordInTransaction: vi.fn(async () => null),
  };
  readonly memory = {
    detectThresholdAlerts: vi.fn(async () => []),
    syncPostPerformance: vi.fn(async () => {}),
  };
  readonly generated = vi.fn();
  readonly graphRuns = vi.fn();
  readonly published = vi.fn();
  readonly engine = new WorkflowEngine({ maxConcurrency: 1 });
  readonly converter = new WorkflowEngineConverterService();
  readonly workers: Worker[] = [];
  readonly queues: Queue<WorkflowExecutionJobData>[] = [];
  readonly queueEvents: QueueEvents[] = [];
  readonly connection: { host: string; port: number; db: number };
  readonly prisma: ReturnType<typeof createRuntimePrisma>['prisma'];
  private readonly workflowPrisma: PrismaClient;
  readonly redis: Redis;
  readonly strategies: AgentStrategiesService;
  readonly reports: AgentStrategyReportsService;
  readonly performance: AgentStrategyAutopilotPerformanceService;
  readonly analytics: AnalyticsSyncService;
  readonly executions: WorkflowExecutionsService;
  readonly runner: SystemWorkflowRunnerService;
  readonly queueService: WorkflowExecutionQueueService;
  readonly publishQueue: ScheduledPostWorkflowQueueService;
  readonly review: BatchGenerationReviewService;
  readonly reviewLocks: BatchReviewLockService;
  readonly policy: AutonomousPublishPolicyService;
  readonly creation: BatchGenerationCreationService;
  readonly processing: BatchGenerationProcessingService;
  autopilot: AgentAutopilotWorkflowService;
  readonly credits = { getOrganizationCreditsBalance: async () => 1000 };
  readonly schedules: PlatformWorkflowSchedulesService;
  readonly cache: CacheService;
  readonly databaseUrl: string;

  constructor() {
    this.databaseUrl = assertIsolatedDatabaseUrl();
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl)
      throw new Error('Proactive runtime requires explicit isolated REDIS_URL');
    const url = new URL(redisUrl);
    if (
      url.protocol !== 'redis:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
      throw new Error('Proactive runtime refuses remote Redis');
    this.connection = {
      db: Number(url.pathname.slice(1) || 0),
      host: url.hostname,
      port: Number(url.port || 6379),
    };
    this.redis = new Redis({ ...this.connection, maxRetriesPerRequest: null });
    const runtimePrisma = createRuntimePrisma(this.databaseUrl);
    this.prisma = runtimePrisma.prisma;
    this.workflowPrisma = runtimePrisma.base;
    for (const name of [
      WORKFLOW_EXECUTION_QUEUE,
      PLATFORM_SYSTEM_WORKFLOW_QUEUE,
      WORKFLOW_BACKGROUND_QUEUE,
      AGENT_TURN_QUEUE,
    ]) {
      this.queues.push(
        new Queue(name, {
          connection: this.connection,
          prefix: this.namespace,
        }),
      );
      this.queueEvents.push(
        new QueueEvents(name, {
          connection: this.connection,
          prefix: this.namespace,
        }),
      );
    }
    this.cache = new CacheService(
      { instance: this.redis, isReady: true } as never,
      {} as never,
      this.logger as never,
    );
    this.strategies = new AgentStrategiesService(
      this.prisma as never,
      this.logger as never,
    );
    this.reports = new AgentStrategyReportsService(
      this.prisma as never,
      this.logger as never,
    );
    this.executions = new WorkflowExecutionsService(
      this.prisma as never,
      this.logger as never,
      { emitExecutionOutcome: vi.fn() } as never,
      this.activity as never,
      this.strategies,
    );
    this.queueService = new WorkflowExecutionQueueService(
      this.queues[0],
      this.queues[1],
      this.queues[2],
      this.queues[3],
      this.logger as never,
    );
    this.publishQueue = new ScheduledPostWorkflowQueueService(
      this.queueService,
    );
    const moduleRef = {
      get: (token: unknown) => {
        if (token === WORKFLOW_ENGINE_ADAPTER) return this.engine;
        if (token === WORKFLOW_EXECUTOR)
          return {
            executeManualWorkflowDocument: async (
              document: WorkflowDocument,
              userId: string,
              organizationId: string,
              inputValues: RecordValue,
              metadata: RecordValue,
              trigger: WorkflowExecutionTrigger,
            ) => {
              const workflow = hydrateWorkflowDefinition(
                document as unknown as RecordValue,
              );
              const execution = await this.executions.createExecution(
                userId,
                organizationId,
                {
                  workflowId: workflow.id,
                  workflowVersionId: workflow.versionId,
                  inputValues,
                  metadata,
                  trigger,
                  totalNodes: workflow.nodes.length,
                },
              );
              return this.executeGraph(workflow, inputValues, execution.id);
            },
          };
        if (token === WorkflowExecutionsService) return this.executions;
        if (token === WorkflowExecutionQueueService) return this.queueService;
        throw new Error(
          `Unexpected runtime fixture dependency: ${String(token)}`,
        );
      },
    };
    this.runner = new SystemWorkflowRunnerService(
      this.prisma as never,
      moduleRef as never,
    );
    this.runner.onModuleInit();
    const artifacts = new AgentArtifactReferenceService(
      this.prisma as never,
      this.logger as never,
    );
    const lifecycle = new PostLifecycleService(
      this.prisma as never,
      this.logger as never,
    );
    const approvals = new PublishApprovalsService(
      this.prisma as never,
      artifacts,
      this.logger as never,
    );
    const posts = new PostsService(
      this.prisma as never,
      this.logger as never,
      {} as never,
      undefined,
      undefined,
      approvals,
      this.publishQueue,
    );
    const summary = new BatchGenerationSummaryService(
      this.prisma as never,
      approvals,
    );
    this.reviewLocks = new BatchReviewLockService(
      {
        get: (key: string) =>
          key === 'DATABASE_URL' ? this.databaseUrl : undefined,
      } as never,
      this.logger as never,
    );
    this.policy = new AutonomousPublishPolicyService(
      this.prisma as never,
      this.activity as never,
    );
    this.review = new BatchGenerationReviewService(
      this.prisma as never,
      this.logger as never,
      artifacts,
      lifecycle,
      approvals,
      summary,
      this.policy,
      this.activity as never,
      this.reviewLocks,
    );
    this.creation = new BatchGenerationCreationService(
      this.prisma as never,
      this.logger as never,
      {
        findOne: (where: RecordValue) =>
          this.prisma.brand.findFirst({
            where: {
              id: String(where.id),
              organizationId: String(where.organizationId),
              isDeleted: false,
            },
          }),
      } as never,
      posts,
      this.cache,
      summary,
    );
    this.processing = new BatchGenerationProcessingService(
      this.prisma as never,
      this.logger as never,
      posts,
      {
        generateContent: async (
          _organizationId: string,
          request: RecordValue,
        ) => {
          this.generated(request);
          return [
            {
              content: `${String(request.topic)}: proof from the workshop\nA measured craft example.`,
            },
          ];
        },
      } as never,
      summary,
      this.policy,
      this.review,
    );
    this.performance = new AgentStrategyAutopilotPerformanceService(
      this.strategies,
      this.reports,
      posts,
      new AgentStrategyOpportunitiesService(
        this.prisma as never,
        this.logger as never,
      ),
      new ContentPerformanceService(this.prisma as never, this.logger as never),
    );
    this.analytics = new AnalyticsSyncService(
      this.prisma as never,
      this.memory,
      this.logger as never,
    );
    this.autopilot = new AgentAutopilotWorkflowService(
      this.prisma as never,
      this.performance,
      this.runner,
      this.credits as never,
      { findOne: async () => ({}) } as never,
      {} as never,
      this.cache,
      this.logger as never,
      { get: (key) => (key === 'DATABASE_URL' ? this.databaseUrl : undefined) },
    );
    this.schedules = new PlatformWorkflowSchedulesService(
      this.prisma as never,
      this.runner,
      this.logger as never,
      {} as never,
      {} as never,
    );

    const delivery = {
      failTerminalValidation: vi.fn(async () => ({ success: false })),
      deliverPost: vi.fn(),
    };
    const publishing = new ScheduledPostWorkflowService(
      this.activity as never,
      delivery as never,
      new ScheduledPostDiscoveryService(posts),
      new ScheduledPostExecutionGuardService(artifacts, {} as never),
      this.logger as never,
      approvals,
      this.prisma as never,
      {
        materializeRecurrence: async () => {},
        scheduleNextRepeat: async () => {},
      } as never,
      this.runner,
    );
    publishing.onModuleInit();
    this.runner.registerAction(
      SCHEDULED_POST_ACTION_IDS.DELIVER,
      async (action) => {
        const claim = runtimeRecord(action.input.claim);
        if (claim.isAlreadyPublished === true) return claim.publishedResult;
        const request = runtimeRecord(action.input.request);
        const postId = String(request.postId);
        const externalId = `fixture-${postId}`;
        this.published(postId);
        // This transition is the deterministic publisher response after the real claim/version checks.
        await lifecycle.transition({
          organizationId: String(request.organizationId),
          postId,
          nextState: TargetExecutionState.PUBLISHING,
          reason: 'Deterministic isolated publisher claim',
        });
        await lifecycle.transition({
          organizationId: String(request.organizationId),
          postId,
          nextState: TargetExecutionState.PUBLISHED,
          reason: 'Deterministic isolated publisher response',
          mutation: { externalId, publishedAt: new Date() },
        });
        return {
          executionState: TargetExecutionState.PUBLISHED,
          externalId,
          platform: 'linkedin',
          success: true,
          url: `https://example.test/${externalId}`,
        };
      },
    );
    this.runner.registerWorkflow(buildAgentTurnWorkflowDefinition());
    this.runner.registerWorkflow(buildAgentProactiveWorkflowDefinition());
    for (const definition of AUTOMATION_CHILD_WORKFLOWS.filter(
      (definition) =>
        definition.canonicalId === 'agent.autopilot.strategy' ||
        definition.canonicalId === 'agent.autopilot.reset-one',
    ))
      this.runner.registerWorkflow(definition);
    this.runner.registerAction(AUTOMATION_ACTION_IDS.AGENT_BEGIN, (action) =>
      this.autopilot.beginProactiveStrategies(action.context.organizationId),
    );
    this.runner.registerAction(
      AUTOMATION_ACTION_IDS.AGENT_DISCOVER_RESETS,
      (action) =>
        this.autopilot.discoverCreditResetStrategies(
          action.context.organizationId,
          action.input,
        ),
    );
    this.runner.registerAction(AUTOMATION_ACTION_IDS.AGENT_RESET, (action) =>
      this.autopilot.resetCreditWindow(
        action.context.organizationId,
        action.input,
      ),
    );
    this.runner.registerAction(AUTOMATION_ACTION_IDS.AGENT_DISCOVER, (action) =>
      this.autopilot.discoverProactiveStrategies(
        action.context.organizationId,
        action.input,
      ),
    );
    this.runner.registerAction(AUTOMATION_ACTION_IDS.AGENT_DISPATCH, (action) =>
      this.autopilot.dispatchProactiveStrategy({
        ...action.input,
        organizationId: action.context.organizationId,
      }),
    );
    this.runner.registerAction(AUTOMATION_ACTION_IDS.AGENT_FINALIZE, (action) =>
      this.autopilot.finalizeProactiveStrategies(
        action.context.organizationId,
        action.input,
      ),
    );
    this.runner.registerAction(AUTOMATION_ACTION_IDS.AGENT_FAIL, (action) =>
      this.autopilot.failProactiveStrategies(
        action.context.organizationId,
        action.input,
      ),
    );
    this.runner.registerAction(
      AGENT_RUNTIME_ACTION_IDS.TURN_PREPARE,
      async (action) => {
        const request = runtimeRecord(action.input.request);
        await this.prisma.agentMessage.create({
          data: {
            organizationId: action.context.organizationId,
            userId: action.context.userId,
            threadId: String(request.threadId),
            role: 'user',
            content: String(request.content),
          },
        });
        return {
          brandId: request.brandId,
          contextVersion: 1,
          state: { request },
          threadId: request.threadId,
        };
      },
    );
    this.runner.registerAction(
      AGENT_RUNTIME_ACTION_IDS.TURN_INFER,
      async (action) => {
        const state = runtimeRecord(action.input.state);
        const request = runtimeRecord(state.request);
        const brief = readRuntimeBrief(String(request.content));
        const strategy = runtimeRecord(brief.strategy);
        const performance = runtimeRecord(brief.weeklyPerformance);
        const winners = performance.topHooks as string[] | undefined;
        const topics = winners?.length
          ? [winners[0]]
          : (strategy.topics as string[]);
        const batch = await this.creation.createBatch(
          {
            brandId: String(request.brandId),
            count: 1,
            platforms: strategy.platforms as string[],
            topics,
            contentMix: {
              carouselPercent: 0,
              imagePercent: 0,
              reelPercent: 0,
              storyPercent: 100,
              videoPercent: 0,
            },
            dateRange: {
              start: new Date().toISOString(),
              end: new Date(Date.now() + 3_600_000).toISOString(),
            },
          },
          action.context.userId,
          action.context.organizationId,
          undefined,
          String(request.strategyId),
        );
        await this.processing.processBatch(
          batch.id,
          action.context.organizationId,
        );
        const items = await this.prisma.batchItem.findMany({
          where: {
            batchId: batch.id,
            organizationId: action.context.organizationId,
            isDeleted: false,
          },
        });
        await this.prisma.post.updateMany({
          where: {
            id: {
              in: items.flatMap((item) => {
                const postId = runtimeRecord(item.data).postId;
                return typeof postId === 'string' && postId.length > 0
                  ? [postId]
                  : [];
              }),
            },
            organizationId: action.context.organizationId,
            isDeleted: false,
          },
          data: { workflowExecutionId: action.context.executionId },
        });
        await this.prisma.creditTransaction.create({
          data: {
            organizationId: action.context.organizationId,
            actorUserId: action.context.userId,
            category: 'deduct',
            amount: -1,
            workflowExecutionId: action.context.executionId,
          },
        });
        return {
          decision: 'final',
          final: { batchId: batch.id },
          state,
          toolItems: [],
        };
      },
    );
    this.runner.registerAction(
      AGENT_RUNTIME_ACTION_IDS.TURN_FINALIZE,
      async (action) => {
        const request = runtimeRecord(
          runtimeRecord(action.input.state).request,
        );
        await this.prisma.agentMessage.create({
          data: {
            organizationId: action.context.organizationId,
            userId: action.context.userId,
            threadId: String(request.threadId),
            role: 'assistant',
            content: 'Draft ready for approval.',
          },
        });
        return {
          content: 'Draft ready for approval.',
          creditsUsed: 1,
          summary: 'One draft ready',
          threadId: request.threadId,
        };
      },
    );
    this.runner.registerAction(
      AGENT_RUNTIME_ACTION_IDS.TURN_FAIL,
      async () => ({ error: 'Fixture turn failed' }),
    );
  }

  async initialize() {
    try {
      this.runner.onApplicationBootstrap();
      await this.prisma.$connect();
      await this.redis.ping();
      await Promise.all(
        this.queueEvents.map((events) => events.waitUntilReady()),
      );
      await this.prisma.user.upsert({
        where: { id: SYSTEM_WORKFLOW_PRINCIPAL_ID },
        create: {
          id: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          handle: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        },
        update: {},
      });
      await this.prisma.organization.upsert({
        where: { id: SYSTEM_WORKFLOW_PRINCIPAL_ID },
        create: {
          id: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          slug: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          label: 'Fixture system',
        },
        update: {},
      });
      await this.prisma.user.create({
        data: { id: this.userId, handle: this.userId },
      });
      await this.prisma.organization.create({
        data: {
          id: this.organizationId,
          userId: this.userId,
          slug: this.organizationId,
          label: 'Isolated agent runtime',
        },
      });
      await this.prisma.brand.create({
        data: {
          id: this.brandId,
          userId: this.userId,
          organizationId: this.organizationId,
          slug: this.brandId,
          label: 'Craft',
          agentConfig: { voice: { tone: 'precise' } },
        },
      });
      await this.prisma.credential.create({
        data: {
          id: this.credentialId,
          brandId: this.brandId,
          userId: this.userId,
          organizationId: this.organizationId,
          platform: CredentialPlatform.LINKEDIN,
          isConnected: true,
          externalId: this.credentialId,
          accessToken: 'fixture-never-used',
        },
      });
    } catch (initializationError) {
      try {
        await this.close();
      } catch (cleanupError) {
        throw new AggregateError(
          [initializationError, cleanupError],
          'Proactive runtime initialization and cleanup failed',
          { cause: initializationError },
        );
      }
      throw initializationError;
    }
  }

  async createAgent(dailyCreditBudget = 20, isActive = true) {
    return this.strategies.createWithClient(
      {
        organizationId: this.organizationId,
        userId: this.userId,
        brandId: this.brandId,
        label: 'Craft agent',
        agentType: AgentType.LINKEDIN_CONTENT,
        platforms: ['linkedin'],
        topics: ['craft'],
        voice: 'precise',
        autonomyMode: AgentAutonomyMode.SUPERVISED,
        dailyCreditBudget,
        weeklyCreditBudget: 100,
        minCreditThreshold: 0,
        isActive,
      },
      this.prisma as never,
    );
  }

  restartDispatcher() {
    this.autopilot = new AgentAutopilotWorkflowService(
      this.prisma as never,
      this.performance,
      this.runner,
      this.credits as never,
      { findOne: async () => ({}) } as never,
      {} as never,
      this.cache,
      this.logger as never,
      { get: (key) => (key === 'DATABASE_URL' ? this.databaseUrl : undefined) },
    );
    return this.autopilot;
  }

  async seedLearningScopeControls(strategyId: string, otherStrategyId: string) {
    const organizationId = `${this.namespace}-paused-org`;
    const brandId = `${this.namespace}-paused-brand`;
    this.ownedOrganizationIds.add(organizationId);
    await this.prisma.organization.create({
      data: {
        id: organizationId,
        userId: this.userId,
        slug: organizationId,
        label: 'Paused control',
      },
    });
    await this.prisma.brand.create({
      data: {
        id: brandId,
        organizationId,
        userId: this.userId,
        slug: brandId,
        label: 'Other organization',
      },
    });
    const foreignAgent = await this.strategies.createWithClient(
      {
        organizationId,
        brandId,
        userId: this.userId,
        label: 'Paused installation agent',
        agentType: AgentType.LINKEDIN_CONTENT,
        platforms: ['linkedin'],
        topics: ['foreign'],
        autonomyMode: AgentAutonomyMode.SUPERVISED,
        dailyCreditBudget: 20,
        weeklyCreditBudget: 100,
        minCreditThreshold: 0,
        isActive: true,
      },
      this.prisma as never,
    );
    const pausedWorkflow = await this.workflowPrisma.$transaction(
      (transaction) =>
        createVersionedWorkflow(
          transaction,
          {
            organizationId,
            userId: this.userId,
            brandId,
            label: 'Paused proactive installation',
            status: WorkflowStatus.DRAFT,
            isScheduleEnabled: false,
            metadata: { sourceTemplateId: 'proactive-agent-strategies' },
          },
          buildAgentProactiveWorkflowDefinition().definition,
        ),
    );
    const otherBrandId = `${this.namespace}-other-brand`;
    await this.prisma.brand.create({
      data: {
        id: otherBrandId,
        organizationId: this.organizationId,
        userId: this.userId,
        slug: otherBrandId,
        label: 'Other brand',
      },
    });
    for (const scope of [
      {
        organizationId,
        brandId,
        agentStrategyId: foreignAgent.id,
        hook: 'Foreign organization winner',
      },
      {
        organizationId: this.organizationId,
        brandId: otherBrandId,
        agentStrategyId: strategyId,
        hook: 'Other brand winner',
      },
      {
        organizationId: this.organizationId,
        brandId: this.brandId,
        agentStrategyId: otherStrategyId,
        hook: 'Other strategy winner',
      },
    ]) {
      const post = await this.prisma.post.create({
        data: {
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          userId: this.userId,
          agentStrategyId: scope.agentStrategyId,
          description: scope.hook,
          platform: 'linkedin',
        },
      });
      await this.analytics.persistItem(scope.organizationId, {
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        userId: this.userId,
        postId: post.id,
        sourceAnalyticsId: `${post.id}-decoy`,
        measuredAt: new Date().toISOString(),
        platform: 'linkedin',
        contentType: 'text',
        hookUsed: scope.hook,
        views: 1000,
        clicks: 1000,
        likes: 1000,
        comments: 1000,
        saves: 1000,
        shares: 1000,
      });
    }
    return { foreignAgent, pausedWorkflow };
  }

  getQueue(name: string) {
    const queue = this.queues.find((candidate) => candidate.name === name);
    if (!queue) throw new Error(`Missing fixture queue ${name}`);
    return queue;
  }

  async stopWorkers() {
    await Promise.all(this.workers.splice(0).map((worker) => worker.close()));
  }

  async makeDue(
    strategyId: string,
    nextRunAt = new Date(Date.now() - 1000).toISOString(),
  ) {
    const row = await this.prisma.agentStrategy.findFirstOrThrow({
      where: {
        id: strategyId,
        organizationId: this.organizationId,
        isDeleted: false,
      },
    });
    await this.prisma.agentStrategy.update({
      where: {
        id: strategyId,
        organizationId: this.organizationId,
        isDeleted: false,
      },
      data: {
        config: toPrismaJson({ ...runtimeRecord(row.config), nextRunAt }),
      },
    });
    return nextRunAt;
  }

  async dispatch(strategyId: string, service = this.autopilot) {
    const row = await this.prisma.agentStrategy.findFirstOrThrow({
      where: {
        id: strategyId,
        organizationId: this.organizationId,
        isDeleted: false,
      },
    });
    return service.dispatchProactiveStrategy({
      item: row,
      organizationId: this.organizationId,
    });
  }

  startWorkers() {
    for (const queue of this.queues) {
      for (let replica = 0; replica < 2; replica++) {
        this.workers.push(
          new Worker(queue.name, (job) => this.process(job), {
            connection: this.connection,
            prefix: this.namespace,
          }),
        );
      }
    }
  }

  async process(job: Job<WorkflowExecutionJobData>) {
    const run = job.data.systemRun;
    if (!run)
      throw new Error('Runtime fixture accepts system workflow jobs only');
    const prior = run.priorExecution;
    if (!prior) {
      return this.runner.runWorkflow(run.input);
    }
    const claimed = await this.prisma.workflowExecution.updateMany({
      where: {
        id: prior.executionId,
        organizationId: run.input.organizationId,
        isDeleted: false,
        status: 'PENDING',
      },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    if (claimed.count !== 1) return;
    const execution = await this.prisma.workflowExecution.findFirstOrThrow({
      where: {
        id: prior.executionId,
        organizationId: run.input.organizationId,
        isDeleted: false,
      },
      include: { workflow: true, workflowVersion: true },
    });
    if (!execution.workflowVersion)
      throw new Error('Queued execution lost its version pin');
    const workflow = hydrateWorkflowDefinition({
      ...execution.workflow,
      organizationId: run.input.organizationId,
      userId: run.input.userId,
      currentVersion: execution.workflowVersion,
    });
    return this.executeGraph(
      workflow,
      run.input.inputValues ?? {},
      execution.id,
    );
  }

  async executeGraph(
    workflow: WorkflowDocument,
    inputValues: RecordValue,
    executionId: string,
  ): Promise<WorkflowExecutionResult> {
    await this.executions.startExecution(executionId);
    const executable = this.converter.applyRuntimeInputValues(
      workflow,
      this.converter.convertToExecutableWorkflow(workflow),
      inputValues,
    );
    const result = await this.engine.execute(executable, {
      executionId,
      maxRetries: 0,
    });
    this.graphRuns({
      workflowId: workflow.id,
      organizationId: workflow.organizationId,
      result,
    });
    const nodeResults = [...result.nodeResults.values()].map((node) => ({
      nodeId: node.nodeId,
      nodeType:
        executable.nodes.find((entry) => entry.id === node.nodeId)?.type ??
        'unknown',
      status: (node.status === 'completed'
        ? 'COMPLETED'
        : 'FAILED') as WorkflowExecutionResult['status'],
      output: runtimeRecord(node.output),
      retryCount: 0,
      creditsUsed: 0,
    }));
    const status = (
      result.status === 'completed' ? 'COMPLETED' : 'FAILED'
    ) as WorkflowExecutionResult['status'];
    const error =
      result.status === 'completed'
        ? undefined
        : JSON.stringify([...result.nodeResults.values()]);
    await this.executions.completeExecution(executionId, error);
    if (error) throw new Error(`Runtime graph ${workflow.id} failed: ${error}`);
    return {
      executionId,
      workflowId: workflow.id,
      status,
      nodeResults,
      totalCreditsUsed: 0,
      startedAt: new Date(),
      completedAt: new Date(),
    };
  }

  async waitForExecution(executionId: string) {
    const jobId = `system-workflow-${executionId}`;
    for (let index = 0; index < this.queues.length; index++) {
      const job = await this.queues[index].getJob(jobId);
      if (job) return job.waitUntilFinished(this.queueEvents[index], 20_000);
    }
    throw new Error('Production queue did not persist its execution job');
  }

  async publish(input: ScheduledPostWorkflowInput) {
    const jobId = await this.publishQueue.enqueue(input);
    const job = await this.queues[0].getJob(jobId);
    if (!job)
      throw new Error('Production queue did not persist its publish job');
    return job.waitUntilFinished(this.queueEvents[0], 20_000);
  }

  async ingest() {
    const discovery = await this.analytics.discoverItems({
      organizationId: this.organizationId,
    });
    for (const item of discovery.items)
      await this.analytics.syncItemMemory(
        this.organizationId,
        await this.analytics.persistItem(this.organizationId, item),
      );
  }

  async close() {
    // Scope every cleanup write to this unique fixture organization; never clear a shared DB.
    const where = { organizationId: { in: [...this.ownedOrganizationIds] } };
    await runOwnedRuntimeCleanup([
      ...this.workers.map((worker) => () => worker.close()),
      ...this.queueEvents.map((events) => () => events.close()),
      ...this.queues.flatMap((queue) => [
        () => queue.obliterate({ force: true }),
        () => queue.close(),
      ]),
      () => this.reviewLocks.onModuleDestroy(),
      () =>
        this.prisma.post.updateMany({
          where,
          data: { publishApprovalId: null, reviewVersionPinId: null },
        }),
      () => this.prisma.publishApproval.deleteMany({ where }),
      () => this.prisma.contentVersionPin.deleteMany({ where }),
      () => this.prisma.batchItem.deleteMany({ where }),
      () => this.prisma.batch.deleteMany({ where }),
      () => this.prisma.contentPerformance.deleteMany({ where }),
      () => this.prisma.postAnalytics.deleteMany({ where }),
      () => this.prisma.agentPublishAudit.deleteMany({ where }),
      () => this.prisma.activity.deleteMany({ where }),
      () => this.prisma.post.deleteMany({ where }),
      () => this.prisma.creditTransaction.deleteMany({ where }),
      () => this.prisma.agentStrategyReport.deleteMany({ where }),
      () => this.prisma.agentMessage.deleteMany({ where }),
      () => this.prisma.agentThread.deleteMany({ where }),
      () => this.prisma.agentStrategy.deleteMany({ where }),
      () => this.prisma.workflowExecution.deleteMany({ where }),
      () => this.prisma.workflow.deleteMany({ where }),
      () => this.prisma.credential.deleteMany({ where }),
      () => this.prisma.brand.deleteMany({ where }),
      () =>
        this.prisma.organization.deleteMany({
          where: { id: { in: [...this.ownedOrganizationIds] } },
        }),
      () => this.prisma.user.deleteMany({ where: { id: this.userId } }),
      () => this.redis.quit(),
      () => this.prisma.$disconnect(),
    ]);
  }
}
