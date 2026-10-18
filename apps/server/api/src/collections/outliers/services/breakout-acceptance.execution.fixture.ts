import { randomUUID } from 'node:crypto';
import { AgentArtifactReferenceService } from '@api/agent-artifacts/agent-artifact-reference.service';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import { LearningCheckpointService } from '@api/collections/content-learning/services/learning-checkpoint.service';
import { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import { LearningOperationService } from '@api/collections/content-learning/services/learning-operation.service';
import { LearningPolicyService } from '@api/collections/content-learning/services/learning-policy.service';
import { LearningScopeStateService } from '@api/collections/content-learning/services/learning-scope-state.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { OptimizersService } from '@api/collections/optimizers/services/optimizers.service';
import {
  buildCollectionHarness,
  type CollectionHarness,
} from '@api/collections/outliers/services/breakout-acceptance.collection.fixture';
import {
  ACCEPTANCE_IMAGE_MODEL,
  ACCEPTANCE_VIDEO_MODEL,
  acceptanceMediaCategory,
  FakeMediaGateway,
  FakeVisualJudge,
  VISUAL_GENERATION_CREDITS,
} from '@api/collections/outliers/services/breakout-acceptance.media.fixture';
import type { AcceptanceWorld } from '@api/collections/outliers/services/breakout-acceptance.world.fixture';
import { DAY_MS } from '@api/collections/outliers/services/breakout-acceptance.world.fixture';
import { BreakoutAutoPublishService } from '@api/collections/outliers/services/breakout-auto-publish.service';
import { BreakoutGenerationPlanService } from '@api/collections/outliers/services/breakout-generation-plan.service';
import { BreakoutMediaOutputGenerationService } from '@api/collections/outliers/services/breakout-media-output-generation.service';
import { BreakoutMediaOutputPreparationService } from '@api/collections/outliers/services/breakout-media-output-preparation.service';
import { BreakoutOutputQualityService } from '@api/collections/outliers/services/breakout-output-quality.service';
import { BreakoutResponseExecutionService } from '@api/collections/outliers/services/breakout-response-execution.service';
import { BreakoutResponseExecutionWorkflowService } from '@api/collections/outliers/services/breakout-response-execution-workflow.service';
import {
  BREAKOUT_RESPONSE_ACTION_ID,
  buildBreakoutResponseExecutionWorkflowDefinition,
} from '@api/collections/outliers/services/breakout-response-execution-workflow-definition';
import { BreakoutReviewHandoffService } from '@api/collections/outliers/services/breakout-review-handoff.service';
import { BreakoutTextOutputGenerationService } from '@api/collections/outliers/services/breakout-text-output-generation.service';
import { BreakoutTextOutputPreparationService } from '@api/collections/outliers/services/breakout-text-output-preparation.service';
import { BreakoutVisualBrandReceiptService } from '@api/collections/outliers/services/breakout-visual-brand-receipt.service';
import { BreakoutVisualQualityService } from '@api/collections/outliers/services/breakout-visual-quality.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { ensureHiddenSystemWorkflowMirror } from '@api/collections/workflows/system-workflow-mirror.util';
import type {
  SystemWorkflowActionExecutor,
  SystemWorkflowActionRequest,
} from '@api/collections/workflows/system-workflow-runner.service';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { PostLifecycleService } from '@api/post-lifecycle/post-lifecycle.service';
import { PublishApprovalsService } from '@api/publish-approvals/publish-approvals.service';
import { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import type { BrandFactCheckService } from '@api/services/brand-validation/brand-fact-check.service';
import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { BrandValidationReceiptService } from '@api/services/brand-validation/brand-validation-receipt.service';
import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import { BrandedGenerationArtifactMaterialService } from '@api/services/branded-generation-receipts/branded-generation-artifact-material.service';
import { hashBrandGenerationRulesReviewV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationPromptStoreService } from '@api/services/branded-generation-receipts/branded-generation-prompt-store.service';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import { TextGenerationCreditsService } from '@api/services/byok/text-generation-credits.service';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { TurboRunService } from '@api/services/turbo-run/turbo-run.service';
import { TurboRunCreationService } from '@api/services/turbo-run/turbo-run-creation.service';
import { TurboRunReviewService } from '@api/services/turbo-run/turbo-run-review.service';
import { TurboRunReviewLockService } from '@api/services/turbo-run/turbo-run-review-lock';
import { TurboRunSummaryService } from '@api/services/turbo-run/turbo-run-summary.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { ModelCategory } from '@genfeedai/contracts';
import { createDefaultBrandPublishPolicy } from '@genfeedai/contracts/api-types/contracts/brand-publish-policy.contract';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { PrismaClient, toPrismaJson } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';

/** An OpenRouter text model id the production eligibility check accepts. */
export const ACCEPTANCE_TEXT_MODEL = 'anthropic/claude-sonnet-4.5';

export type ApprovedBrandRules = Pick<
  BrandIdentitySnapshotV1['generationRules'],
  | 'assets'
  | 'avoid'
  | 'evidence'
  | 'examples'
  | 'facts'
  | 'mandatory'
  | 'palette'
  | 'schemaVersion'
  | 'typography'
>;

/** A minimal approved Brand OS revision, so approved-brand generation can compile a snapshot. */
export async function seedApprovedBrandIdentity(
  db: PrismaClient<'query'>,
  world: AcceptanceWorld,
  /** Rules the approved revision carries, on top of an empty rule set. */
  overrides: Partial<ApprovedBrandRules> = {},
): Promise<void> {
  const rules: ApprovedBrandRules = {
    assets: [],
    avoid: [],
    evidence: [],
    examples: [],
    facts: [],
    mandatory: [],
    palette: [],
    schemaVersion: 1 as const,
    typography: [],
    ...overrides,
  };
  await db.brandOsRevision.create({
    data: {
      approvedAt: new Date(Date.now() - DAY_MS),
      approvedById: world.owner.id,
      brandId: world.brandId,
      generationRulesReviewHash: hashBrandGenerationRulesReviewV1(rules),
      content: {
        brandId: world.brandId,
        generationRules: rules,
        organizationId: world.organizationId,
        // The approved Policy (#7339) opens text to the earned streak.
        policy: toPrismaJson(createDefaultBrandPublishPolicy()),
        fields: {
          description: {
            currentValue: 'Clear tools for creative teams.',
            evidence: [{ sourceType: 'system' }],
          },
          label: {
            currentValue: 'Acceptance Brand',
            evidence: [{ sourceType: 'manual' }],
          },
          voiceAudience: {
            currentValue: ['Founders', 'Creators'],
            evidence: [{ sourceType: 'manual' }],
          },
        },
      },
      id: `bk-rev-${world.suffix}`,
      organizationId: world.organizationId,
      status: 'APPROVED',
      version: 1,
    },
  });
}

/** Fake OpenRouter: the text provider. Records every call; each call answers a fresh text. */
export class FakeOpenRouter {
  assertApiKeyAvailable = () => undefined;
  readonly calls: Array<{ model: string; prompt: string }> = [];
  /** What the provider answered with, for reconciling an answer the caller never recorded. */
  readonly issued: Array<{ id: string; model: string; text: string }> = [];
  /** Reply for the nth call (0-based); defaults to a short distinct sentence. */
  reply: (index: number, prompt: string) => string = (index) =>
    `Follow-up ${index + 1}: a concrete next step that turns that spike into a repeatable habit.`;

  /** Runs once the provider has the request and before it answers: a crash/revocation point. */
  onCall?: (index: number) => Promise<void>;

  chatCompletion = async (request: {
    messages: Array<{ content: string }>;
    model: string;
  }) => {
    const index = this.calls.length;
    const prompt = request.messages
      .map((message) => message.content)
      .join('\n');
    this.calls.push({ model: request.model, prompt });
    await this.onCall?.(index);
    const text = this.reply(index, prompt);
    const id = `gen-${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    this.issued.push({ id, model: request.model, text });
    return { choices: [{ message: { content: text } }], id };
  };
}

/**
 * Fake Replicate: the provider behind the real quality scorer. It answers with the structured
 * analysis the real OptimizersService prompt asks for, at a controllable overall score.
 */
export class FakeReplicate {
  readonly calls: string[] = [];
  score = 88;

  generateStructuredTextSync = async (
    _model: string,
    params: {
      beforeAttempt?: (input: Record<string, unknown>) => Promise<void>;
      input: Record<string, unknown>;
      onAttempt?: (
        input: Record<string, unknown>,
        output: string,
      ) => Promise<void>;
      prompt: string;
      schema: { parse: (value: unknown) => unknown };
    },
  ) => {
    const attemptInput = { ...params.input, prompt: params.prompt };
    await params.beforeAttempt?.(attemptInput);
    this.calls.push(params.prompt);
    const output = {
      breakdown: {
        clarity: this.score,
        engagement: this.score,
        platformOptimization: this.score,
        readability: this.score,
        viralPotential: this.score,
      },
      overallScore: this.score,
      suggestions: [],
    };
    await params.onAttempt?.(attemptInput, JSON.stringify(output));
    return params.schema.parse(output);
  };
}

export type ExecutionHarness = CollectionHarness & {
  brandAccess: BrandAccessService;
  credits: CreditsUtilsService;
  execution: BreakoutResponseExecutionService;
  /** Fake image and video providers behind the product's generation gateway. */
  mediaGateway: FakeMediaGateway;
  openRouter: FakeOpenRouter;
  receipts: BrandedGenerationReceiptsService;
  replicate: FakeReplicate;
  /** The action executor the hidden `breakout.response.execute` workflow registered. */
  actions: Map<string, SystemWorkflowActionExecutor>;
  /** Scenario hooks into the run, for authority or evidence changes between steps. */
  hooks: { duringPlanning?: () => Promise<void> };
  material: BrandedGenerationArtifactMaterialService;
  validation: BrandValidationReceiptService;
  /** Fake visual judge behind the product's evaluation endpoint. */
  visualJudge: FakeVisualJudge;
  workflowExecutions: WorkflowExecutionsService;
  workflowService: BreakoutResponseExecutionWorkflowService;
  /** The publishing inbox where a draft that needs brand review waits for a member. */
  turboReview: TurboRunReviewService;
};

/** What a scenario may change in the graph; nothing by default. */
export type ExecutionHarnessOptions = {
  /**
   * The brand fact check (#6717). None by default, so factual coverage stays unknown as it
   * does where no check is wired; a scenario passes a fake to pin the claim verdicts.
   */
  factCheck?: Pick<BrandFactCheckService, 'check'>;
};

type Stub = never;

/**
 * The full execution graph over the real database: planner, capacity reservation, wallet,
 * generation receipts, draft creation, lineage binding and quality scoring are production
 * code. Faked: the OpenRouter and Replicate providers, the model catalog and router, the
 * account constraint lookup and the BullMQ transport.
 */
export function buildExecutionHarness(
  db: PrismaClient<'query'>,
  prisma: PrismaService,
  logger: LoggerService,
  world: AcceptanceWorld,
  options: ExecutionHarnessOptions = {},
): ExecutionHarness {
  const brandAccess = new BrandAccessService(prisma);
  const balances = new CreditBalanceService(prisma, logger);
  const ledger = new CreditTransactionsService(prisma, logger, balances, {
    invalidate: async () => undefined,
  } as Stub);
  const reservations = new CreditReservationService(
    prisma,
    logger,
    balances,
    ledger,
    new TransactionUtil(prisma, logger),
  );
  const credits = new CreditsUtilsService(
    logger,
    prisma,
    new BillingAccountsService(prisma, logger),
    balances,
    reservations,
    ledger,
    {} as Stub,
    { emit: () => undefined } as Stub,
    { invalidateForOrganization: async () => undefined } as Stub,
    new TransactionUtil(prisma, logger),
    {
      assertTrialActive: async () => undefined,
      isTrialExpired: async () => false,
    } as Stub,
  );
  const artifacts = new AgentArtifactReferenceService(db, logger);
  const publishApprovals = new PublishApprovalsService(db, artifacts, logger);
  const posts = new PostsService(
    prisma,
    logger,
    {
      completeMissions: async () => undefined,
    } as unknown as OnboardingCreditGrantsService,
    undefined,
    undefined,
    publishApprovals,
  );
  const collection = buildCollectionHarness(prisma, logger, world, posts);

  const openRouter = new FakeOpenRouter();
  const replicate = new FakeReplicate();
  // The review inbox is production code: a draft needing brand review is queued into a manual
  // review run, and a member's approval there is the human step that schedules it.
  const summary = new TurboRunSummaryService(prisma, publishApprovals);
  const reviewLocks = new TurboRunReviewLockService(
    {
      get: (key: string) =>
        key === 'DATABASE_URL'
          ? process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL
          : undefined,
    } as Stub,
    logger,
  );
  const turboReview = new TurboRunReviewService(
    prisma,
    logger,
    artifacts,
    new PostLifecycleService(db, logger),
    publishApprovals,
    summary,
    new AutonomousPublishPolicyService(prisma, {} as Stub),
    {} as Stub,
    reviewLocks,
  );
  const turboRuns = new TurboRunService(
    new TurboRunCreationService(
      prisma,
      logger,
      {
        findOne: async (query: { id: string; organizationId: string }) =>
          db.brand.findFirst({
            where: scopedWhere(query.organizationId, { id: query.id }),
          }),
      } as Stub,
      posts,
      {
        get: async () => null,
        invalidateByTags: async () => undefined,
        set: async () => undefined,
      } as Stub,
      summary,
    ),
    {} as Stub,
    turboReview,
  );
  const strategies = new AgentStrategiesService(prisma, logger);
  const optimizers = new OptimizersService(
    prisma,
    logger,
    {
      findOne: async () => ({ cost: 1, pricingType: 'flat' }),
    } as Stub,
    replicate as Stub,
  );
  const receiptAccess = new BrandedGenerationReceiptAccessService(brandAccess);
  const receipts = new BrandedGenerationReceiptsService(
    prisma,
    receiptAccess,
    new BrandedGenerationPromptStoreService(receiptAccess),
  );
  const snapshots = new BrandIdentitySnapshotService(
    prisma,
    receiptAccess,
    receipts,
  );
  const material = new BrandedGenerationArtifactMaterialService(
    prisma,
    receiptAccess,
    receipts,
  );
  const validator = new BrandValidationService();
  const validation = new BrandValidationReceiptService(
    material,
    receipts,
    validator,
    undefined,
    undefined,
    undefined,
    undefined,
    options.factCheck as BrandFactCheckService | undefined,
  );
  const generation = new BrandedTextGenerationService(
    receipts,
    snapshots,
    material,
    validator,
    validation,
    new HarnessGenerationService({} as Stub, logger, brandAccess),
    {
      buildSkillPromptSections: () => '',
      resolveActiveSkills: async () => [],
    } as Stub,
    openRouter as Stub,
    brandAccess,
  );
  const visualJudge = new FakeVisualJudge();
  const visualQuality = new BreakoutVisualQualityService(
    prisma,
    visualJudge as Stub,
    {
      findOne: async () => ({
        inputCostPerMillionTokens: 10_000,
        outputCostPerMillionTokens: 10_000,
        pricingType: 'per-token',
      }),
    } as Stub,
    { getFeatureSettings: async () => ({ generationMaxTokens: 500 }) } as Stub,
    credits,
  );
  const quality = new BreakoutOutputQualityService(
    prisma,
    strategies,
    optimizers,
    credits,
    visualQuality,
  );
  const reviewHandoff = new BreakoutReviewHandoffService(prisma, turboRuns);
  const textGeneration = new BreakoutTextOutputGenerationService(
    prisma,
    generation,
    new TextGenerationCreditsService({
      resolveApiKey: async () => null,
    } as Stub),
    credits,
    posts,
    quality,
    reviewHandoff,
  );
  const dependencies = new LearningDependencyService(prisma);
  const scopes = new LearningScopeStateService(prisma, dependencies);
  const policies = new LearningPolicyService(prisma, dependencies, scopes);
  const accounts = new LearningAccountService(
    prisma,
    new LearningOperationService(prisma),
    dependencies,
    scopes,
    policies,
  );
  const learning = new LearningDecisionService(
    prisma,
    accounts,
    new LearningCheckpointService(prisma, accounts, dependencies),
    policies,
    scopes,
    dependencies,
  );
  const hooks: ExecutionHarness['hooks'] = {};
  const registry = {
    listCallableGenerationModels: async (
      _organizationId: string,
      category: ModelCategory,
    ) => [
      {
        key:
          category === ModelCategory.VIDEO
            ? ACCEPTANCE_VIDEO_MODEL
            : ACCEPTANCE_IMAGE_MODEL,
      },
    ],
    listCallableTextModels: async () => {
      await hooks.duringPlanning?.();
      return [{ key: ACCEPTANCE_TEXT_MODEL }];
    },
    validateModelForOrg: async (key: string) => ({
      category:
        key === ACCEPTANCE_IMAGE_MODEL || key === ACCEPTANCE_VIDEO_MODEL
          ? acceptanceMediaCategory(key)
          : ModelCategory.TEXT,
      isActive: true,
      isDeleted: false,
      key,
      provider: 'replicate',
    }),
  };
  const accountConstraints = {
    resolveDraft: async () => ({
      brand: { id: world.brandId },
      constraints: {
        maxCharacters: 280,
        notes: [],
        supportsDirectPublishing: true,
        supportsRichArticleCopy: false,
        supportsThreads: true,
        usesWeightedCharacters: false,
      },
    }),
  };
  const planner = new BreakoutGenerationPlanService(
    prisma,
    registry as Stub,
    {
      resolveModelKey: async (input: { eligibleModelKeys: string[] }) => ({
        key: input.eligibleModelKeys[0],
      }),
    } as Stub,
    accountConstraints as Stub,
    optimizers,
    snapshots,
    validator,
    {
      estimate: async () => ({
        credits: VISUAL_GENERATION_CREDITS,
        isAvailable: true,
      }),
    } as Stub,
    visualQuality,
  );
  const preparation = new BreakoutTextOutputPreparationService(
    prisma,
    registry as Stub,
    accountConstraints as Stub,
    learning,
    textGeneration,
  );
  const mediaGateway = new FakeMediaGateway(db, credits);
  const media = new BreakoutMediaOutputPreparationService(
    prisma,
    registry as Stub,
    preparation,
    new BreakoutMediaOutputGenerationService(
      prisma,
      mediaGateway as Stub,
      snapshots,
      validator,
    ),
    quality,
    reviewHandoff,
    new BreakoutVisualBrandReceiptService(
      prisma,
      receipts,
      material,
      snapshots,
      validation,
      logger,
    ),
  );
  const execution = new BreakoutResponseExecutionService(
    prisma,
    planner,
    preparation,
    media,
    new BreakoutAutoPublishService(
      prisma,
      posts,
      new AutonomousPublishPolicyService(prisma, {} as Stub),
      logger,
    ),
  );
  const actions = new Map<string, SystemWorkflowActionExecutor>();
  const workflowService = new BreakoutResponseExecutionWorkflowService(
    execution,
    {
      registerAction: (id: string, executor: SystemWorkflowActionExecutor) => {
        actions.set(id, executor);
      },
      registerWorkflow: () => undefined,
    } as Stub,
    prisma,
    brandAccess,
  );
  workflowService.onModuleInit();
  const workflowExecutions = new WorkflowExecutionsService(
    prisma,
    logger,
    {} as Stub,
    {} as Stub,
    strategies,
  );
  return {
    ...collection,
    actions,
    brandAccess,
    credits,
    execution,
    hooks,
    material,
    mediaGateway,
    openRouter,
    receipts,
    replicate,
    validation,
    visualJudge,
    workflowExecutions,
    turboReview,
    workflowService,
  };
}

export type QueuedExecutionHandle = { executionId: string };

type QueuedSystemRun = {
  systemRun: {
    input: {
      actionType: string;
      canonicalId: string;
      inputValues: Record<string, unknown>;
      organizationId: string;
      source: string;
      userId: string;
    };
  };
};

/**
 * The worker's pickup of a queued `breakout.response.execute` job: persists the hidden,
 * version-pinned system execution the way the runner does, then invokes the registered
 * system action with the engine context. Returns the action's result.
 */
export async function startQueuedBreakoutExecution(
  harness: ExecutionHarness,
  prisma: PrismaService,
  jobId: string,
  /** Re-run the action inside an execution already persisted (a worker retry). */
  resume?: QueuedExecutionHandle,
) {
  const job = harness.interactive.jobs.get(jobId);
  if (!job) throw new Error(`No queued job ${jobId}`);
  const { input } = (job.data as QueuedSystemRun).systemRun;
  const definition = buildBreakoutResponseExecutionWorkflowDefinition();
  const workflow = await ensureHiddenSystemWorkflowMirror(prisma, definition);
  if (!workflow.currentVersion) throw new Error('Workflow has no version pin');
  let created: { id: string };
  if (resume) created = { id: resume.executionId };
  else {
    created = await harness.workflowExecutions.createExecution(
      input.userId,
      input.organizationId,
      {
        inputValues: input.inputValues,
        metadata: {
          actionType: input.actionType,
          canonicalId: input.canonicalId,
          dispatchClass: 'interactive',
          isSystemAction: true,
          source: input.source,
        },
        totalNodes: definition.definition.nodes.length,
        trigger: 'api',
        workflowId: workflow.id,
        workflowVersionId: workflow.currentVersion.id,
      } as Parameters<WorkflowExecutionsService['createExecution']>[2],
    );
    await harness.workflowExecutions.startExecution(
      created.id,
      input.organizationId,
    );
  }
  const executor = harness.actions.get(BREAKOUT_RESPONSE_ACTION_ID);
  if (!executor) throw new Error('Breakout execution action is not registered');
  const request: SystemWorkflowActionRequest = {
    context: {
      executionId: created.id,
      organizationId: input.organizationId,
      runId: created.id,
      userId: input.userId,
      workflowId: workflow.id,
      workflowVersionId: workflow.currentVersion.id,
    } as SystemWorkflowActionRequest['context'],
    input: { request: input.inputValues.request },
    provenance: {
      executionId: created.id,
      idempotencyKey: `workflow:${created.id}:execute-response`,
      nodeId: 'execute-response',
      workflowId: workflow.id,
      workflowLabel: definition.label,
    },
  };
  return {
    executionId: created.id,
    /** Invokes the action; rejects as the worker's job would when the action throws. */
    run: async () =>
      (await executor(request)) as {
        outputIds: string[];
        reason: string | null;
        responseId: string;
        status: 'completed' | 'held' | 'processing';
      },
    workflowId: workflow.id,
  };
}

/** Pickup and one invocation, for scenarios that do not retry inside the execution. */
export async function runQueuedBreakoutExecution(
  harness: ExecutionHarness,
  prisma: PrismaService,
  jobId: string,
) {
  const started = await startQueuedBreakoutExecution(harness, prisma, jobId);
  return {
    executionId: started.executionId,
    result: await started.run(),
    workflowId: started.workflowId,
  };
}
