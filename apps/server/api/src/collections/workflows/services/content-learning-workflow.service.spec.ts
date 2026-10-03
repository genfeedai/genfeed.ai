import {
  buildArtifactContentDigest,
  projectPostArtifactMaterial,
  readArtifactRecord,
} from '@api/agent-artifacts/agent-artifact-material.util';
import { LearningBaselineMaterializationService } from '@api/collections/content-learning/services/learning-baseline-materialization.service';
import { LearningCheckpointService } from '@api/collections/content-learning/services/learning-checkpoint.service';
import { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import {
  learningHash,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import { LearningPolicyService } from '@api/collections/content-learning/services/learning-policy.service';
import {
  learningPublicationDependencyRefsV1,
  learningPublicationFinalizationVersionV1,
  learningPublicationPostVersionV1,
} from '@api/collections/content-learning/services/learning-publication-source.helper';
import type {
  LearningPublicationApprovalRow,
  LearningPublicationAssociationV1,
  LearningPublicationFinalizationRow,
  LearningPublicationPinRow,
  LearningPublicationPostRow,
} from '@api/collections/content-learning/services/learning-publication-source.types';
import { LearningRewardService } from '@api/collections/content-learning/services/learning-reward.service';
import { LearningRunService } from '@api/collections/content-learning/services/learning-run.service';
import type { WorkflowInputVariable } from '@api/collections/workflows/schemas/workflow.schema';
import { ContentLearningWorkflowService } from '@api/collections/workflows/services/content-learning-workflow.service';
import { WorkflowEngineConverterService } from '@api/collections/workflows/services/workflow-engine-converter.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  CONTENT_LEARNING_ACTION_IDS,
  CONTENT_LEARNING_WORKFLOW_TEMPLATES,
} from '@api/collections/workflows/templates/content-learning-workflows.template';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  Platform,
  PostCategory,
  PostFormat,
  PostVisibility,
  PublishApprovalStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  LearningCellDescriptor,
  LearningScope,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import {
  learningDescriptorTuple,
  learningRegisteredProfiles,
} from '@genfeedai/harness';
import type {
  ContentLearningAccount,
  ContentLearningBaseline,
  ContentLearningCheckpoint,
  ContentLearningDependency,
  ContentLearningScopeState,
  Post,
  Prisma,
} from '@genfeedai/prisma';
import {
  buildActionExecutionInput,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
function refreshAccount(): ContentLearningAccount {
  return {
    id: 'account',
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    mode: 'shadow',
    revision: 3,
    epoch: 2,
    evidenceRevision: 7,
    resetAt: null,
    activeConfigVersion: 'rl-reward-v1-experimental',
    sharingConsentVersion: null,
    sharedReleasePreference: 'automatic',
    pinnedReleaseId: null,
    activePolicyId: null,
    approvedArmIds: [],
    pilotStartedAt: null,
    prePilotReleaseId: null,
    failureReason: null,
    driftState: null,
  };
}
function refreshScope(
  scope: LearningScope,
  cell: LearningCellDescriptor,
): ContentLearningScopeState {
  return {
    id: 'state',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    scopeKey: learningScopeKey(scope),
    epoch: 2,
    revision: 1,
    activePolicyId: null,
    pinnedPolicyId: null,
    lastValidRewardAt: null,
    cellDescriptor: { ...structuredClone(cell) },
    descriptorHash: scope.rewardProfileId,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
async function fixture() {
  const materializer = {
    materialize: vi
      .fn<LearningBaselineMaterializationService['materialize']>()
      .mockResolvedValue(null),
  };
  const scopeRows: ContentLearningScopeState[] = [],
    accountRows: ContentLearningAccount[] = [];
  const account = refreshAccount();
  const prisma = {
    user: { findFirst: vi.fn().mockResolvedValue({ id: 'operator' }) },
    post: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'post',
        credentialId: 'credential',
        platform: 'twitter',
        publishedAt: new Date(Date.now() - 48 * 3600000),
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
    contentLearningAccount: {
      findFirst: vi.fn().mockResolvedValue(account),
      findMany: vi
        .fn()
        .mockImplementation(
          async (args: Prisma.ContentLearningAccountFindManyArgs) =>
            accountRows
              .filter(
                (row) =>
                  !args.where?.id ||
                  typeof args.where.id !== 'object' ||
                  typeof args.where.id.gt !== 'string' ||
                  row.id > args.where.id.gt,
              )
              .slice(0, args.take ?? 51),
        ),
    },
    organization: {
      findFirst: vi.fn().mockResolvedValue({ id: 'org', isDeleted: false }),
    },
    brand: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'brand',
        organizationId: 'org',
        isDeleted: false,
        isActive: true,
      }),
    },
    credential: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'credential',
        organizationId: 'org',
        brandId: 'brand',
        isDeleted: false,
        isConnected: true,
        platform: 'TWITTER',
      }),
    },
    contentLearningScopeState: {
      findMany: vi
        .fn()
        .mockImplementation(
          async (args: Prisma.ContentLearningScopeStateFindManyArgs) =>
            scopeRows
              .filter(
                (row) =>
                  !args.where?.id ||
                  typeof args.where.id !== 'object' ||
                  typeof args.where.id.gt !== 'string' ||
                  row.id > args.where.id.gt,
              )
              .slice(0, args.take ?? 9),
        ),
    },
    contentLearningCheckpoint: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    contentLearningDecision: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    contentLearningDependency: { findMany: vi.fn().mockResolvedValue([]) },
    publishApproval: { findFirst: vi.fn().mockResolvedValue(null) },
    contentVersionPin: { findFirst: vi.fn().mockResolvedValue(null) },
    postPublishFinalization: { findFirst: vi.fn().mockResolvedValue(null) },
    contentLearningOperation: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentLearningRun: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ status: 'completed', error: null }),
    },
  };
  const queue = { queueSystemWorkflow: vi.fn().mockResolvedValue('job') },
    runner = { registerWorkflow: vi.fn(), runWorkflow: vi.fn() },
    runs = {
      execute: vi.fn().mockResolvedValue({}),
      reconcileDispatch: vi.fn().mockResolvedValue({ dispatchable: true }),
    },
    checkpoints = {
      fulfilledWindow: vi.fn().mockResolvedValue(null),
      latestAttempt: vi.fn().mockResolvedValue(null),
    };
  const policies = { rebuild: vi.fn().mockResolvedValue(null) },
    dependencies = { invalidate: vi.fn().mockResolvedValue(0) },
    rewards = {
      commitForCheckpoint: vi
        .fn<LearningRewardService['commitForCheckpoint']>()
        .mockResolvedValue({
          status: 'unavailable',
          reason: 'decision_unbound',
        }),
    };
  const module = await Test.createTestingModule({
    providers: [
      ContentLearningWorkflowService,
      { provide: PrismaService, useValue: prisma },
      { provide: WorkflowExecutionQueueService, useValue: queue },
      { provide: SystemWorkflowRunnerService, useValue: runner },
      { provide: LearningPolicyService, useValue: policies },
      { provide: LearningRunService, useValue: runs },
      { provide: LearningDependencyService, useValue: dependencies },
      { provide: LearningCheckpointService, useValue: checkpoints },
      {
        provide: LearningBaselineMaterializationService,
        useValue: materializer,
      },
      { provide: LearningRewardService, useValue: rewards },
    ],
  }).compile();
  return {
    rewards,
    prisma,
    queue,
    runner,
    runs,
    checkpoints,
    materializer,
    account,
    accountRows,
    scopeRows,
    policies,
    dependencies,
    service: module.get<ContentLearningWorkflowService>(
      ContentLearningWorkflowService,
    ),
  };
}
describe('durable scoped content learning workflow dispatch', () => {
  afterEach(() => vi.useRealTimers());
  it('queues the fixed-age checkpoint on background with the immutable post/window key', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    const f = await fixture();
    await f.service.queueCheckpoint('org', 'post');
    expect(f.queue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org',
        inputValues: { postId: 'post' },
      }),
      'learning-checkpoint-post-48h-v1',
      expect.objectContaining({
        attempts: 3,
        delayMs: 0,
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
      }),
    );
  });
  it('does not enqueue disabled or expired publications', async () => {
    const f = await fixture();
    f.prisma.contentLearningAccount.findFirst.mockResolvedValue({
      mode: 'disabled',
    });
    expect(await f.service.queueCheckpoint('org', 'post')).toBeNull();
    expect(f.queue.queueSystemWorkflow).not.toHaveBeenCalled();
  });
  it('suppresses queue replacement for an already fulfilled publication window', async () => {
    const f = await fixture();
    f.checkpoints.fulfilledWindow.mockResolvedValue({ id: 'checkpoint' });
    expect(await f.service.queueCheckpoint('org', 'post')).toBeNull();
    expect(f.queue.queueSystemWorkflow).not.toHaveBeenCalled();
  });
  it('never reports a Bull success as an observed checkpoint without a persisted receipt', async () => {
    const f = await fixture();
    f.runner.runWorkflow.mockResolvedValue({ provenance: 'bull-success' });
    expect(
      await f.service.execute(CONTENT_LEARNING_ACTION_IDS.CHECKPOINT, 'org', {
        postId: 'post',
      }),
    ).toMatchObject({
      status: 'pending',
      reason: 'observation_receipt_missing',
    });
  });
  it('retains the actual persisted retryable attempt reason and identity', async () => {
    const f = await fixture(),
      publishedAt = new Date(Date.now() - 48 * 3600000);
    f.checkpoints.latestAttempt.mockResolvedValue({
      id: 'failed-attempt',
      sourceAttemptId: 'actual-attempt',
      publishedAt,
      requestStartedAt: new Date(),
      receivedAt: new Date(),
      providerAsOf: null,
      validity: 'rate_limited',
      measurement: {
        collection: {
          version: 1,
          outcome: 'retryable_failure',
          reasonCode: 'rate_limited',
        },
      },
    });
    expect(
      await f.service.execute(CONTENT_LEARNING_ACTION_IDS.CHECKPOINT, 'org', {
        postId: 'post',
      }),
    ).toMatchObject({
      status: 'pending',
      checkpointId: 'failed-attempt',
      reason: 'rate_limited',
    });
  });
  it('loads the authorized operation in the executing organization rather than trusting run payload', async () => {
    const f = await fixture();
    await expect(
      f.service.execute(
        CONTENT_LEARNING_ACTION_IDS.DATASET_TRAIN,
        'foreign-org',
        { operationId: 'operation', runId: 'forged' },
      ),
    ).rejects.toThrow('Stored authorized operation');
    expect(f.runs.execute).not.toHaveBeenCalled();
    expect(f.prisma.contentLearningOperation.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'operation',
        organizationId: 'foreign-org',
        isDeleted: false,
        type: 'dataset-train',
      },
    });
  });
  it('executes only the run linked by the stored receipt', async () => {
    const f = await fixture();
    f.prisma.contentLearningOperation.findFirst.mockResolvedValue({
      id: 'operation',
      status: 'pending',
      resultReferences: { runId: 'stored-run' },
    });
    await f.service.execute(CONTENT_LEARNING_ACTION_IDS.DATASET_TRAIN, 'org', {
      operationId: 'operation',
      runId: 'forged',
    });
    expect(f.runs.execute).toHaveBeenCalledWith({
      runId: 'stored-run',
      operationId: 'operation',
      organizationId: 'org',
    });
    expect(f.prisma.contentLearningOperation.updateMany).not.toHaveBeenCalled();
  });
  it('registers all six versioned graphs', async () => {
    const f = await fixture();
    f.service.onModuleInit();
    expect(f.runner.registerWorkflow).toHaveBeenCalledTimes(6);
  });
  it('disposes poisoned dispatch receipts and continues the remaining sweep', async () => {
    const f = await fixture();
    f.prisma.$transaction.mockImplementation(
      async (apply: (tx: unknown) => unknown) => apply(f.prisma),
    );
    f.prisma.contentLearningOperation.findMany.mockResolvedValue([
      {
        id: 'poisoned',
        type: 'dataset-train',
        resultReferences: { runId: ['array'] },
      },
      {
        id: 'healthy',
        type: 'dataset-evaluate',
        resultReferences: { runId: 'run' },
      },
    ]);
    f.runs.reconcileDispatch = vi
      .fn()
      .mockResolvedValue({ dispatchable: true });
    const result = await f.service.reconcile('org');
    expect(f.prisma.contentLearningOperation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'poisoned' }),
        data: expect.objectContaining({
          status: 'failed',
          error: 'dispatch_receipt_invalid',
        }),
      }),
    );
    expect(f.runs.reconcileDispatch).toHaveBeenCalledWith({
      runId: 'run',
      operationId: 'healthy',
      organizationId: 'org',
    });
    expect(result.queued).toBe(1);
  });
});

function workflowPublication(index: number, cell: LearningCellDescriptor) {
  const postId = 'post',
    cutoff = new Date(),
    published = new Date(cutoff.getTime() - 48 * 3600000);
  const post: LearningPublicationPostRow &
    Pick<Post, 'learningDecisionId' | 'updatedAt'> = {
    id: postId,
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    isDeleted: false,
    category: PostCategory.TEXT,
    description: `content-${index}`,
    entityArticleId: null,
    entityIngredientId: null,
    entityModel: null,
    groupId: null,
    isRepeat: false,
    isShareToFeedSelected: true,
    label: null,
    maxRepeats: null,
    nextScheduledDate: null,
    order: 0,
    originalPostId: null,
    parentId: null,
    platform: Platform.TWITTER,
    publishIntent: null,
    quoteTweetId: null,
    repeatDaysOfWeek: [],
    repeatEndDate: null,
    repeatFrequency: null,
    repeatInterval: null,
    scheduleSlot: null,
    scheduledDate: null,
    targetAttachments: [],
    targetSettings: {},
    timezone: 'UTC',
    variantId: null,
    format: PostFormat.STANDARD,
    visibility: PostVisibility.PUBLIC,
    targetExecutionState: TargetExecutionState.PUBLISHED,
    externalId: `external-${index}`,
    publishedAt: published,
    publishApprovalId: `approval-${index}`,
    reviewVersionPinId: `pin-${index}`,
    _count: { ingredients: 0, children: 0 },
    learningDecisionId: null,
    updatedAt: cutoff,
  };
  const pin: LearningPublicationPinRow = {
    id: `pin-${index}`,
    organizationId: 'org',
    brandId: 'brand',
    recordKind: 'post',
    recordId: postId,
    contentDigest: buildArtifactContentDigest({
      ...projectPostArtifactMaterial(
        readArtifactRecord({ ...post, ingredients: [] }),
      ),
      children: [],
    }),
  };
  const approval: LearningPublicationApprovalRow = {
    id: `approval-${index}`,
    organizationId: 'org',
    brandId: 'brand',
    postId,
    artifactVersionPinId: pin.id,
    operationId: `operation-${index}`,
    status: PublishApprovalStatus.PUBLISHED,
    invalidatedAt: null,
    scopeDigest: `scope-${index}`,
  };
  const association: LearningPublicationAssociationV1 = {
    version: 1,
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    postId,
    approvalId: approval.id,
    approvalOperationId: approval.operationId,
    versionPinId: pin.id,
    platform: Platform.TWITTER,
    externalId: `external-${index}`,
    publishedAt: published.toISOString(),
    contentDigest: pin.contentDigest,
    postSourceVersion: learningPublicationPostVersionV1({
      organizationId: 'org',
      brandId: 'brand',
      credentialId: 'credential',
      postId,
      platform: Platform.TWITTER,
      externalId: `external-${index}`,
      publishedAt: published.toISOString(),
      description: post.description,
    }),
  };
  const finalization: LearningPublicationFinalizationRow = {
    id: `finalization-${index}`,
    organizationId: 'org',
    postId,
    result: {
      success: true,
      isProviderDraft: false,
      executionState: 'published',
      platform: 'twitter',
      externalId: `external-${index}`,
      learningPublication: { ...association },
    },
  };
  const checkpoint: ContentLearningCheckpoint = {
    id: `checkpoint-${String(index).padStart(3, '0')}`,
    isDeleted: false,
    createdAt: cutoff,
    updatedAt: cutoff,
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    postId,
    windowId: '48h-v1',
    revision: 1,
    sourceAttemptId: `attempt-${index}`,
    dueAt: cutoff,
    requestStartedAt: cutoff,
    receivedAt: cutoff,
    providerAsOf: null,
    sourceAnalyticsId: `analytics-${index}`,
    measurement: {
      collection: { version: 1, outcome: 'observed', reasonCode: null },
      measurement: { exposure: 1000 + index, weightedActions: index },
      profiles: [
        {
          profileId: learningHash(learningDescriptorTuple(cell)),
          descriptor: { ...structuredClone(cell) },
          measurement: { exposure: 1000 + index, weightedActions: index },
        },
      ],
    },
    format: 'text',
    publishedAt: published,
    organicProvenance: { isPaid: false, isPinned: false, source: 'provider' },
    sourceFingerprint: `fingerprint-${index}`,
    supersedesId: null,
    validity: 'valid',
    attestation: null,
  };
  const refs = learningPublicationDependencyRefsV1({
    ...association,
    finalizationId: finalization.id,
    finalizationVersion: learningPublicationFinalizationVersionV1(association),
    approvalVersion: learningHash([
      'learning-publication-approval-v1',
      'org',
      'brand',
      postId,
      approval.id,
      approval.operationId,
      pin.id,
      pin.contentDigest,
      approval.scopeDigest,
    ]),
  });
  const edges = refs.map(
    (ref, i): ContentLearningDependency => ({
      id: `source-${index}-${i}`,
      isDeleted: false,
      createdAt: cutoff,
      updatedAt: cutoff,
      sourceKind: ref.kind,
      sourceId: ref.id,
      sourceOrganizationId: ref.organizationId,
      sourceVersion: ref.version,
      derivedKind: 'checkpoint',
      derivedId: checkpoint.id,
      derivedOrganizationId: 'org',
      valid: true,
      invalidatedAt: null,
    }),
  );
  return { post, pin, approval, finalization, checkpoint, edges };
}

function currentScope() {
  const descriptor = learningRegisteredProfiles(
    'twitter',
    'text',
    'engagement',
  )[0]?.descriptor;
  if (!descriptor) throw new Error('Missing registered descriptor');
  const scope: LearningScope = {
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    platform: descriptor.platform,
    format: descriptor.format,
    objective: descriptor.objective,
    rewardProfileId: learningHash(learningDescriptorTuple(descriptor)),
  };
  return { scope, descriptor };
}
async function observedFixture(preexisting = true) {
  const f = await fixture(),
    { scope, descriptor } = currentScope(),
    publication = workflowPublication(0, descriptor);
  f.scopeRows.push(refreshScope(scope, descriptor));
  f.prisma.post.findFirst.mockResolvedValue(publication.post);
  f.prisma.publishApproval.findFirst.mockResolvedValue(publication.approval);
  f.prisma.contentVersionPin.findFirst.mockResolvedValue(publication.pin);
  f.prisma.postPublishFinalization.findFirst.mockResolvedValue(
    publication.finalization,
  );
  f.prisma.contentLearningCheckpoint.findFirst.mockResolvedValue(
    publication.checkpoint,
  );
  f.prisma.contentLearningDependency.findMany.mockImplementation(
    async (args: Prisma.ContentLearningDependencyFindManyArgs) =>
      args.take === 9 ? publication.edges : [],
  );
  if (preexisting)
    f.checkpoints.fulfilledWindow.mockResolvedValue(publication.checkpoint);
  else
    f.checkpoints.fulfilledWindow
      .mockResolvedValueOnce(null)
      .mockResolvedValue(publication.checkpoint);
  return { ...f, publication, scope, descriptor };
}

async function engineRun(
  action: (typeof CONTENT_LEARNING_ACTION_IDS)[keyof typeof CONTENT_LEARNING_ACTION_IDS],
  values: Record<string, unknown> = {},
  suppliedFixture?: Awaited<ReturnType<typeof fixture>>,
  extraConfig: Record<string, unknown> = {},
  output?: Record<string, unknown>,
) {
  const f = suppliedFixture ?? (await fixture());
  const template = CONTENT_LEARNING_WORKFLOW_TEMPLATES.find(
    (item) => item.id === action,
  );
  if (!template) throw new Error('Missing learning template');
  const inputVariables: WorkflowInputVariable[] = (
    template.inputVariables ?? []
  ).map((variable) => ({ ...variable, required: variable.required ?? false }));
  const document = {
    id: template.id,
    organizationId: 'org',
    nodes: template.nodes ?? [],
    edges: template.edges ?? [],
    inputVariables,
  };
  const converter = new WorkflowEngineConverterService();
  const executable = converter.applyRuntimeInputValues(
    document,
    converter.convertToExecutableWorkflow(document),
    values,
  );
  const node = executable.nodes.find((item) => item.id === 'learning-action');
  if (!node) throw new Error('Missing learning action node');
  Object.assign(node.config, extraConfig);
  const engine = new WorkflowEngine({ maxConcurrency: 1 }),
    inputsSeen: Record<string, unknown>[] = [];
  engine.registerExecutor(action, async (current, inputs) => {
    const input = buildActionExecutionInput(current.config, inputs);
    inputsSeen.push(input);
    return output ?? (await f.service.execute(action, 'org', input));
  });
  const result = await engine.execute(executable, { maxRetries: 0 });
  return { f, executable, inputsSeen, result };
}

describe('A2/A3 actual typed templates, converter and engine contracts', () => {
  afterEach(() => vi.useRealTimers());
  it('versions only reconcile/checkpoint and preserves schedule and all four older templates', () => {
    const changed = CONTENT_LEARNING_WORKFLOW_TEMPLATES.filter(
      (item) => item.version === 2,
    );
    expect(changed.map((item) => item.id)).toEqual([
      CONTENT_LEARNING_ACTION_IDS.RECONCILE,
      CONTENT_LEARNING_ACTION_IDS.CHECKPOINT,
    ]);
    for (const template of CONTENT_LEARNING_WORKFLOW_TEMPLATES) {
      if (template.id === CONTENT_LEARNING_ACTION_IDS.RECONCILE)
        expect(template).toMatchObject({
          schedule: '*/5 * * * *',
          isScheduleEnabled: true,
        });
      else if (template.id === CONTENT_LEARNING_ACTION_IDS.RETENTION)
        expect(template).toMatchObject({
          version: 1,
          schedule: '20 3 * * *',
          isScheduleEnabled: true,
        });
      else expect(template.isScheduleEnabled).toBe(false);
      if (template.version === 2) {
        expect(template.changeSummary).toBe(
          'Refresh committed learning evidence through bounded account and scope pages.',
        );
        expect(template.nodes?.[0]?.data).toMatchObject({
          config: { parameters: {} },
        });
        expect(JSON.stringify(template.nodes)).not.toContain('{{inputs.');
      } else expect(template.version).toBe(1);
    }
  });
  it('keeps absent optional values absent and false/zero typed through the real engine into actual reconcile', async () => {
    const absent = await engineRun(CONTENT_LEARNING_ACTION_IDS.RECONCILE);
    expect(absent.result.status).toBe('completed');
    expect(absent.inputsSeen).toEqual([{}]);
    expect(
      absent.result.nodeResults.get('learning-action')?.output,
    ).toMatchObject({ status: 'completed', queued: 0, failed: 0 });
    const typed = await engineRun(CONTENT_LEARNING_ACTION_IDS.RECONCILE, {
      materializationOnly: false,
      refreshBucket: 0,
    });
    expect(typed.result.status).toBe('completed');
    expect(typed.inputsSeen).toEqual([
      { materializationOnly: false, refreshBucket: 0 },
    ]);
  });
  it('installs actual postId rather than a literal and accepts the actual observed nullable reason output', async () => {
    const f = await observedFixture(false);
    const run = await engineRun(
      CONTENT_LEARNING_ACTION_IDS.CHECKPOINT,
      { postId: 'post' },
      f,
    );
    expect(run.result.status).toBe('completed');
    expect(run.inputsSeen).toEqual([{ postId: 'post' }]);
    expect(run.result.nodeResults.get('learning-action')?.output).toMatchObject(
      {
        status: 'completed',
        checkpointId: f.publication.checkpoint.id,
        reason: null,
      },
    );
    expect(f.materializer.materialize).toHaveBeenCalledOnce();
  });
  it('rejects missing required checkpoint postId before the actual executor', async () => {
    const run = await engineRun(CONTENT_LEARNING_ACTION_IDS.CHECKPOINT);
    expect(run.result.status).toBe('failed');
    expect(run.inputsSeen).toEqual([]);
    expect(run.f.prisma.post.findFirst).not.toHaveBeenCalled();
  });
  it.each([
    { materializationOnly: null },
    { materializationOnly: 'false' },
    { accountCursor: '' },
    { scopeCursor: ' '.repeat(257) },
    { accountCursor: ' cursor' },
    { refreshBucket: -1 },
    { refreshBucket: 1.5 },
    { refreshBucket: Number.MAX_SAFE_INTEGER + 1 },
  ])(
    'rejects invalid reconcile values through the actual contract/service %j',
    async (input) => {
      const run = await engineRun(CONTENT_LEARNING_ACTION_IDS.RECONCILE, input);
      expect(run.result.status).toBe('failed');
      expect(
        run.f.prisma.contentLearningAccount.findMany,
      ).not.toHaveBeenCalled();
    },
  );
  it('rejects an unknown action configuration property through closed engine validation', async () => {
    const run = await engineRun(
      CONTENT_LEARNING_ACTION_IDS.RECONCILE,
      {},
      undefined,
      { unexpected: true },
    );
    expect(run.result.status).toBe('failed');
    expect(run.inputsSeen).toEqual([]);
  });
  it.each([
    { materializationOnly: true },
    { accountCursor: 'account' },
    { scopeCursor: 'scope' },
    { refreshBucket: 0 },
  ])(
    'rejects reconcile-only fields on the actual checkpoint action %j',
    async (config) => {
      const run = await engineRun(
        CONTENT_LEARNING_ACTION_IDS.CHECKPOINT,
        { postId: 'post' },
        undefined,
        config,
      );
      expect(run.result.status).toBe('failed');
      expect(run.inputsSeen).toEqual([]);
    },
  );
  it('accepts stored operation runStatus null through the actual engine output schema', async () => {
    const f = await fixture();
    f.prisma.contentLearningOperation.findFirst.mockResolvedValue({
      id: 'operation',
      resultReferences: { runId: 'run' },
      status: 'completed',
      error: null,
    });
    f.prisma.contentLearningRun.findFirst.mockResolvedValue(null);
    const run = await engineRun(
      CONTENT_LEARNING_ACTION_IDS.DATASET_TRAIN,
      {},
      f,
      { operationId: 'operation' },
    );
    expect(run.result.status).toBe('completed');
    expect(run.result.nodeResults.get('learning-action')?.output).toEqual({
      operationId: 'operation',
      runStatus: null,
      status: 'completed',
      reason: null,
    });
  });
  it.each([
    { status: 'completed', failed: -1 },
    { status: 'completed', unexpected: true },
  ])('rejects malformed actual action output %j', async (output) => {
    const run = await engineRun(
      CONTENT_LEARNING_ACTION_IDS.RECONCILE,
      {},
      undefined,
      {},
      output,
    );
    expect(run.result.status).toBe('failed');
    expect(run.inputsSeen).toHaveLength(1);
  });
});

describe('A4 bounded current account scope recovery', () => {
  afterEach(() => vi.useRealTimers());
  it.each([
    { credentialId: null },
    { credentialId: '' },
    { credentialId: 3 },
    { materializationOnly: null },
    { materializationOnly: 0 },
    { accountCursor: null },
    { accountCursor: '' },
    { accountCursor: ' cursor' },
    { accountCursor: 'x'.repeat(257) },
    { scopeCursor: 'scope' },
    { credentialId: 'credential', accountCursor: 'account' },
    { credentialId: 'credential', scopeCursor: null },
    { credentialId: 'credential', scopeCursor: ' scope' },
    { refreshBucket: null },
    { refreshBucket: -1 },
    { refreshBucket: 0.5 },
    { refreshBucket: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects invalid refresh input before DB work %j', async (input) => {
    const f = await fixture();
    await expect(f.service.reconcile('org', input)).rejects.toThrow(
      'Invalid learning materialization input',
    );
    expect(f.prisma.contentLearningAccount.findFirst).not.toHaveBeenCalled();
    expect(f.prisma.contentLearningAccount.findMany).not.toHaveBeenCalled();
  });
  it('processes only the first eight enumerated rows sequentially with one cutoff and advances an invalid eighth', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
    const f = await fixture(),
      { scope, descriptor } = currentScope();
    for (let i = 0; i < 9; i++)
      f.scopeRows.push({
        ...refreshScope(scope, descriptor),
        id: `scope-${i}`,
        ...(i === 7 ? { revision: -1 } : {}),
      });
    let active = 0,
      maxActive = 0;
    f.materializer.materialize.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
      return null;
    });
    expect(
      await f.service.reconcile('org', {
        credentialId: 'credential',
        materializationOnly: false,
        refreshBucket: 0,
      }),
    ).toEqual({ status: 'completed', queued: 1, failed: 0 });
    expect(f.materializer.materialize).toHaveBeenCalledTimes(7);
    expect(maxActive).toBe(1);
    const cutoff = f.materializer.materialize.mock.calls[0]?.[2];
    expect(cutoff).toEqual(new Date('2026-10-02T12:00:00Z'));
    expect(
      f.materializer.materialize.mock.calls.every(
        ([, , date]) => date === cutoff,
      ),
    ).toBe(true);
    expect(
      f.prisma.contentLearningScopeState.findMany,
    ).toHaveBeenCalledExactlyOnceWith({
      where: {
        organizationId: 'org',
        brandId: 'brand',
        credentialId: 'credential',
        epoch: 2,
        isDeleted: false,
      },
      orderBy: { id: 'asc' },
      take: 9,
    });
    expect(f.queue.queueSystemWorkflow).toHaveBeenCalledExactlyOnceWith(
      {
        organizationId: 'org',
        actionType: CONTENT_LEARNING_ACTION_IDS.RECONCILE,
        canonicalId: CONTENT_LEARNING_ACTION_IDS.RECONCILE,
        inputValues: {
          materializationOnly: true,
          refreshBucket: 0,
          credentialId: 'credential',
          scopeCursor: 'scope-7',
        },
        source: 'content-learning-reconcile',
      },
      'learning-materialize-' +
        learningHash([
          'continuation-v1',
          'org',
          0,
          'credential',
          null,
          'scope-7',
        ]),
      { attempts: 3, dispatchClass: SystemWorkflowDispatchClass.BACKGROUND },
    );
    expect(f.prisma.post.findMany).not.toHaveBeenCalled();
    expect(f.prisma.contentLearningOperation.findMany).not.toHaveBeenCalled();
  });
  it('continues strictly after the saved scope cursor and uses current epoch after a reset', async () => {
    const f = await fixture(),
      { scope, descriptor } = currentScope();
    f.account.epoch = 9;
    f.scopeRows.push({
      ...refreshScope(scope, descriptor),
      epoch: 9,
      id: 'scope-b',
    });
    await f.service.reconcile('org', {
      credentialId: 'credential',
      scopeCursor: 'scope-a',
      refreshBucket: 123,
    });
    expect(f.prisma.contentLearningScopeState.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        brandId: 'brand',
        credentialId: 'credential',
        epoch: 9,
        isDeleted: false,
        id: { gt: 'scope-a' },
      },
      orderBy: { id: 'asc' },
      take: 9,
    });
    expect(f.materializer.materialize).toHaveBeenCalledExactlyOnceWith(
      scope,
      descriptor,
      expect.any(Date),
    );
  });
  it.each([
    'missing',
    'foreign',
    'deleted',
    'disabled',
    'disconnected',
    'inactive',
    'unknown-platform',
    'bad-config',
    'bad-counter',
    'wrong-credential',
  ])(
    'has no scope/materializer authority for %s account context',
    async (mutation) => {
      const f = await fixture();
      if (mutation === 'missing')
        f.prisma.contentLearningAccount.findFirst.mockResolvedValue(null);
      if (mutation === 'foreign') f.account.organizationId = 'foreign';
      if (mutation === 'deleted') f.account.isDeleted = true;
      if (mutation === 'disabled') f.account.mode = 'disabled';
      if (mutation === 'disconnected')
        f.prisma.credential.findFirst.mockResolvedValue({
          id: 'credential',
          organizationId: 'org',
          brandId: 'brand',
          isDeleted: false,
          isConnected: false,
          platform: 'TWITTER',
        });
      if (mutation === 'inactive')
        f.prisma.brand.findFirst.mockResolvedValue({
          id: 'brand',
          organizationId: 'org',
          isDeleted: false,
          isActive: false,
        });
      if (mutation === 'unknown-platform')
        f.prisma.credential.findFirst.mockResolvedValue({
          id: 'credential',
          organizationId: 'org',
          brandId: 'brand',
          isDeleted: false,
          isConnected: true,
          platform: 'UNSUPPORTED',
        });
      if (mutation === 'bad-config')
        f.account.activeConfigVersion = 'unregistered';
      if (mutation === 'bad-counter') f.account.evidenceRevision = -1;
      if (mutation === 'wrong-credential') f.account.credentialId = 'other';
      expect(
        await f.service.reconcile('org', { credentialId: 'credential' }),
      ).toEqual({
        status: 'unavailable',
        reason: 'account_unavailable',
        queued: 0,
        failed: 0,
      });
      expect(
        f.prisma.contentLearningScopeState.findMany,
      ).not.toHaveBeenCalled();
      expect(f.materializer.materialize).not.toHaveBeenCalled();
      expect(f.queue.queueSystemWorkflow).not.toHaveBeenCalled();
    },
  );
  it.each([
    'foreign',
    'brand',
    'credential',
    'epoch',
    'deleted',
    'revision',
    'descriptor',
    'hash',
    'key',
    'format',
    'platform',
    'config',
  ])(
    'skips invalid %s scope without fabricating a descriptor',
    async (mutation) => {
      const f = await fixture(),
        { scope, descriptor } = currentScope(),
        row = refreshScope(scope, descriptor);
      if (mutation === 'foreign') row.organizationId = 'foreign';
      if (mutation === 'brand') row.brandId = 'other';
      if (mutation === 'credential') row.credentialId = 'other';
      if (mutation === 'epoch') row.epoch++;
      if (mutation === 'deleted') row.isDeleted = true;
      if (mutation === 'revision') row.revision = -1;
      if (mutation === 'descriptor') row.cellDescriptor = {};
      if (mutation === 'hash') row.descriptorHash = 'other';
      if (mutation === 'key') row.scopeKey = 'other';
      if (mutation === 'format')
        row.cellDescriptor = { ...descriptor, format: 'image' };
      if (mutation === 'platform')
        row.cellDescriptor = { ...descriptor, platform: 'facebook' };
      if (mutation === 'config')
        row.cellDescriptor = { ...descriptor, configVersion: 'unregistered' };
      f.scopeRows.push(row);
      expect(
        await f.service.reconcile('org', { credentialId: 'credential' }),
      ).toEqual({ status: 'completed', queued: 0, failed: 0 });
      expect(f.materializer.materialize).not.toHaveBeenCalled();
    },
  );
  it('propagates materialization failure so a retry retains recovery rather than reporting success', async () => {
    const f = await fixture(),
      { scope, descriptor } = currentScope(),
      error = new Error('materialization DB');
    f.scopeRows.push(refreshScope(scope, descriptor));
    f.materializer.materialize.mockRejectedValue(error);
    await expect(
      f.service.reconcile('org', { credentialId: 'credential' }),
    ).rejects.toBe(error);
    expect(f.queue.queueSystemWorkflow).not.toHaveBeenCalled();
  });
});

describe('A5 bounded fair account sweep', () => {
  afterEach(() => vi.useRealTimers());
  it('queues first fifty sequential targets and one continuation at an invalid fiftieth enumerated ID', async () => {
    const f = await fixture();
    for (let i = 0; i < 51; i++)
      f.accountRows.push({
        ...refreshAccount(),
        id: `account-${String(i).padStart(3, '0')}`,
        credentialId: `credential-${i}`,
        ...(i === 49 ? { revision: -1 } : {}),
      });
    let active = 0,
      maxActive = 0;
    f.queue.queueSystemWorkflow.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
      return 'job';
    });
    expect(
      await f.service.reconcile('org', {
        materializationOnly: true,
        refreshBucket: 17,
      }),
    ).toEqual({ status: 'completed', queued: 50, failed: 0 });
    expect(f.queue.queueSystemWorkflow).toHaveBeenCalledTimes(50);
    expect(maxActive).toBe(1);
    expect(
      f.prisma.contentLearningAccount.findMany,
    ).toHaveBeenCalledExactlyOnceWith({
      where: {
        organizationId: 'org',
        isDeleted: false,
        mode: { not: 'disabled' },
      },
      orderBy: { id: 'asc' },
      take: 51,
    });
    const calls = f.queue.queueSystemWorkflow.mock.calls;
    expect(calls[0]).toEqual([
      {
        organizationId: 'org',
        actionType: CONTENT_LEARNING_ACTION_IDS.RECONCILE,
        canonicalId: CONTENT_LEARNING_ACTION_IDS.RECONCILE,
        inputValues: {
          credentialId: 'credential-0',
          materializationOnly: true,
          refreshBucket: 17,
        },
        source: 'content-learning-reconcile',
      },
      `learning-materialize-${learningHash(['org', 'credential-0', 2, 7, 17])}`,
      { attempts: 3, dispatchClass: SystemWorkflowDispatchClass.BACKGROUND },
    ]);
    expect(calls.at(-1)).toEqual([
      {
        organizationId: 'org',
        actionType: CONTENT_LEARNING_ACTION_IDS.RECONCILE,
        canonicalId: CONTENT_LEARNING_ACTION_IDS.RECONCILE,
        inputValues: {
          materializationOnly: true,
          refreshBucket: 17,
          accountCursor: 'account-049',
        },
        source: 'content-learning-reconcile',
      },
      'learning-materialize-' +
        learningHash(['continuation-v1', 'org', 17, null, 'account-049', null]),
      { attempts: 3, dispatchClass: SystemWorkflowDispatchClass.BACKGROUND },
    ]);
    expect(
      calls.some(
        ([input]) => input.inputValues?.credentialId === 'credential-50',
      ),
    ).toBe(false);
    expect(f.prisma.post.findMany).not.toHaveBeenCalled();
    expect(f.prisma.contentLearningOperation.findMany).not.toHaveBeenCalled();
  });
  it('retains the explicit bucket/cursor across retry while initial bucket uses server page time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
    const f = await fixture();
    f.accountRows.push({ ...refreshAccount(), id: 'account-b' });
    await f.service.reconcile('org', { materializationOnly: true });
    const initialBucket = Math.floor(Date.now() / 300000);
    expect(f.queue.queueSystemWorkflow.mock.calls[0]?.[1]).toBe(
      'learning-materialize-' +
        learningHash(['org', 'credential', 2, 7, initialBucket]),
    );
    f.queue.queueSystemWorkflow.mockClear();
    const input = {
      materializationOnly: true,
      accountCursor: 'account-a',
      refreshBucket: 0,
    };
    await f.service.reconcile('org', input);
    const key = f.queue.queueSystemWorkflow.mock.calls[0]?.[1];
    vi.setSystemTime(new Date('2026-10-03T12:00:00Z'));
    await f.service.reconcile('org', input);
    expect(f.queue.queueSystemWorkflow.mock.calls[1]?.[1]).toBe(key);
    expect(f.prisma.contentLearningAccount.findMany).toHaveBeenLastCalledWith({
      where: {
        organizationId: 'org',
        isDeleted: false,
        mode: { not: 'disabled' },
        id: { gt: 'account-a' },
      },
      orderBy: { id: 'asc' },
      take: 51,
    });
  });
  it('propagates queue rejection and retries the persisted target rather than silently dropping it', async () => {
    const f = await fixture(),
      error = new Error('queue');
    f.accountRows.push(refreshAccount());
    f.queue.queueSystemWorkflow.mockRejectedValueOnce(error);
    await expect(
      f.service.reconcile('org', {
        materializationOnly: true,
        refreshBucket: 7,
      }),
    ).rejects.toBe(error);
    expect(
      await f.service.reconcile('org', {
        materializationOnly: true,
        refreshBucket: 7,
      }),
    ).toEqual({ status: 'completed', queued: 1, failed: 0 });
    expect(f.queue.queueSystemWorkflow.mock.calls[0]?.[1]).toBe(
      f.queue.queueSystemWorkflow.mock.calls[1]?.[1],
    );
    expect(f.prisma.post.findMany).not.toHaveBeenCalled();
  });
  it('adds bounded refresh counts to the unchanged legacy post and authorized-operation work by default', async () => {
    const f = await fixture();
    f.accountRows.push(refreshAccount());
    f.prisma.post.findMany.mockResolvedValue([{ id: 'post' }]);
    f.prisma.contentLearningOperation.findMany.mockResolvedValue([
      {
        id: 'operation',
        type: 'dataset-train',
        resultReferences: { runId: 'run' },
      },
    ]);
    expect(await f.service.reconcile('org')).toEqual({
      status: 'completed',
      queued: 3,
      failed: 0,
    });
    expect(f.runs.reconcileDispatch).toHaveBeenCalledExactlyOnceWith({
      organizationId: 'org',
      operationId: 'operation',
      runId: 'run',
    });
    expect(
      f.queue.queueSystemWorkflow.mock.calls.map(([, key]) => key),
    ).toContain('learning-checkpoint-post-48h-v1');
    expect(
      f.queue.queueSystemWorkflow.mock.calls.map(([, key]) => key),
    ).toContain('learning-operation-operation');
  });
});

describe('A6 physical observation recovery and exact current source reporting', () => {
  afterEach(() => vi.useRealTimers());
  it.each([true, false])(
    'refreshes and reports genuine observed evidence with preexisting=%s through actual source proof',
    async (preexisting) => {
      const f = await observedFixture(preexisting),
        before = structuredClone(f.publication.edges);
      expect(
        await f.service.execute(CONTENT_LEARNING_ACTION_IDS.CHECKPOINT, 'org', {
          postId: 'post',
        }),
      ).toEqual({
        status: 'completed',
        checkpointId: f.publication.checkpoint.id,
        reason: preexisting ? 'already_observed' : null,
        result: {
          reward: {
            status: 'unavailable',
            rewardId: null,
            rewardStatus: null,
            reason: 'decision_unbound',
          },
        },
      });
      expect(f.materializer.materialize).toHaveBeenCalledExactlyOnceWith(
        f.scope,
        f.descriptor,
        expect.any(Date),
      );
      expect(f.runner.runWorkflow).toHaveBeenCalledTimes(preexisting ? 0 : 1);
      expect(f.publication.edges).toEqual(before);
    },
  );
  it('commits the reward for a completed checkpoint and never queues a rebuild', async () => {
    const f = await observedFixture();
    f.rewards.commitForCheckpoint.mockResolvedValue({
      status: 'committed',
      rewardId: 'reward',
      rewardStatus: 'valid',
      decisionId: 'decision',
      scopeKey: 'scope',
    });
    expect(
      await f.service.execute(CONTENT_LEARNING_ACTION_IDS.CHECKPOINT, 'org', {
        postId: 'post',
      }),
    ).toMatchObject({
      status: 'completed',
      result: {
        reward: {
          status: 'committed',
          rewardId: 'reward',
          rewardStatus: 'valid',
          reason: null,
        },
      },
    });
    expect(f.rewards.commitForCheckpoint).toHaveBeenCalledExactlyOnceWith(
      'org',
      f.publication.checkpoint.id,
    );
    expect(
      f.queue.queueSystemWorkflow.mock.calls.map(
        ([request]) => request.actionType,
      ),
    ).not.toContain(CONTENT_LEARNING_ACTION_IDS.ACCOUNT_REBUILD);
    expect(f.policies.rebuild).not.toHaveBeenCalled();
  });
  it('propagates a reward commit failure to the durable retry', async () => {
    const f = await observedFixture(),
      error = new Error('reward DB');
    f.rewards.commitForCheckpoint.mockRejectedValue(error);
    await expect(
      f.service.execute(CONTENT_LEARNING_ACTION_IDS.CHECKPOINT, 'org', {
        postId: 'post',
      }),
    ).rejects.toBe(error);
  });
  it.each(['legacy', 'superseded'])(
    'refreshes %s physical evidence but never recollects or reports eligibility',
    async (mutation) => {
      const f = await observedFixture();
      if (mutation === 'legacy') {
        const edge = f.publication.edges.find(
          (item) => item.sourceKind === 'post',
        );
        if (!edge) throw new Error('Missing source edge');
        edge.sourceVersion = 'post';
      } else f.publication.checkpoint.validity = 'superseded';
      const before = structuredClone(f.publication.edges);
      expect(
        await f.service.execute(CONTENT_LEARNING_ACTION_IDS.CHECKPOINT, 'org', {
          postId: 'post',
        }),
      ).toEqual({
        status: 'unavailable',
        checkpointId: f.publication.checkpoint.id,
        reason:
          mutation === 'legacy'
            ? 'publication_source_unavailable'
            : 'superseded',
      });
      expect(f.materializer.materialize).toHaveBeenCalledOnce();
      expect(f.runner.runWorkflow).not.toHaveBeenCalled();
      expect(f.rewards.commitForCheckpoint).not.toHaveBeenCalled();
      expect(f.publication.edges).toEqual(before);
    },
  );
  it.each(['terminal', 'retryable', 'missing'])(
    'does not refresh %s receipts',
    async (outcome) => {
      const f = await observedFixture(false);
      if (outcome === 'missing') {
        f.checkpoints.fulfilledWindow.mockResolvedValue(null);
        f.checkpoints.latestAttempt.mockResolvedValue(null);
      } else {
        f.publication.checkpoint.measurement = {
          collection: {
            version: 1,
            outcome:
              outcome === 'terminal'
                ? 'terminal_unavailable'
                : 'retryable_failure',
            reasonCode: 'provider_reason',
          },
        };
        f.publication.checkpoint.validity = 'provider_reason';
        f.checkpoints.fulfilledWindow.mockResolvedValue(
          outcome === 'terminal' ? f.publication.checkpoint : null,
        );
        f.checkpoints.latestAttempt.mockResolvedValue(f.publication.checkpoint);
      }
      const result = await f.service.execute(
        CONTENT_LEARNING_ACTION_IDS.CHECKPOINT,
        'org',
        { postId: 'post' },
      );
      expect(result.status).toBe(
        outcome === 'terminal' ? 'unavailable' : 'pending',
      );
      expect(f.materializer.materialize).not.toHaveBeenCalled();
      expect(f.rewards.commitForCheckpoint).not.toHaveBeenCalled();
    },
  );
  it('retries refresh failure over the same committed fulfilled row without another provider workflow', async () => {
    const f = await observedFixture(false),
      error = new Error('materialization DB');
    f.materializer.materialize.mockRejectedValueOnce(error);
    await expect(
      f.service.execute(CONTENT_LEARNING_ACTION_IDS.CHECKPOINT, 'org', {
        postId: 'post',
      }),
    ).rejects.toBe(error);
    expect(
      await f.service.execute(CONTENT_LEARNING_ACTION_IDS.CHECKPOINT, 'org', {
        postId: 'post',
      }),
    ).toMatchObject({
      status: 'completed',
      checkpointId: f.publication.checkpoint.id,
      reason: 'already_observed',
    });
    expect(f.runner.runWorkflow).toHaveBeenCalledOnce();
    expect(f.materializer.materialize).toHaveBeenCalledTimes(2);
  });
  it('propagates source-proof database errors after refresh instead of manufacturing completion', async () => {
    const f = await observedFixture(),
      error = new Error('source DB');
    f.prisma.contentLearningCheckpoint.findFirst.mockRejectedValue(error);
    await expect(
      f.service.execute(CONTENT_LEARNING_ACTION_IDS.CHECKPOINT, 'org', {
        postId: 'post',
      }),
    ).rejects.toBe(error);
    expect(f.materializer.materialize).toHaveBeenCalledOnce();
    expect(f.runner.runWorkflow).not.toHaveBeenCalled();
  });
});

describe('remaining A2/A4/A5 compatibility boundaries', () => {
  afterEach(() => vi.useRealTimers());
  it('transports all correct targeted refresh values through the real converter and action executor', async () => {
    const f = await fixture(),
      { scope, descriptor } = currentScope();
    f.scopeRows.push({ ...refreshScope(scope, descriptor), id: 'scope-b' });
    const values = {
      credentialId: 'credential',
      materializationOnly: true,
      scopeCursor: 'scope-a',
      refreshBucket: 0,
    };
    const run = await engineRun(
      CONTENT_LEARNING_ACTION_IDS.RECONCILE,
      values,
      f,
    );
    expect(run.result.status).toBe('completed');
    expect(run.inputsSeen).toEqual([values]);
    expect(f.materializer.materialize).toHaveBeenCalledOnce();
    expect(f.prisma.post.findMany).not.toHaveBeenCalled();
  });
  it('transports the sweep cursor and explicit zero bucket through the real converter', async () => {
    const f = await fixture();
    f.accountRows.push({ ...refreshAccount(), id: 'account-b' });
    const values = {
      materializationOnly: true,
      accountCursor: 'account-a',
      refreshBucket: 0,
    };
    const run = await engineRun(
      CONTENT_LEARNING_ACTION_IDS.RECONCILE,
      values,
      f,
    );
    expect(run.result.status).toBe('completed');
    expect(run.inputsSeen).toEqual([values]);
    expect(
      f.prisma.contentLearningAccount.findMany,
    ).toHaveBeenCalledExactlyOnceWith({
      where: {
        organizationId: 'org',
        isDeleted: false,
        mode: { not: 'disabled' },
        id: { gt: 'account-a' },
      },
      orderBy: { id: 'asc' },
      take: 51,
    });
    expect(f.queue.queueSystemWorkflow.mock.calls[0]?.[0].inputValues).toEqual({
      credentialId: 'credential',
      materializationOnly: true,
      refreshBucket: 0,
    });
    expect(f.prisma.post.findMany).not.toHaveBeenCalled();
  });
  it('treats an insufficient baseline result as an honest completed refresh rather than serving or legacy work', async () => {
    const f = await fixture(),
      { scope, descriptor } = currentScope(),
      cutoff = new Date();
    const row: ContentLearningBaseline = {
      id: 'insufficient',
      isDeleted: false,
      createdAt: cutoff,
      updatedAt: cutoff,
      organizationId: 'org',
      brandId: 'brand',
      credentialId: 'credential',
      fingerprint: 'fingerprint',
      scopeKey: learningScopeKey(scope),
      cellDescriptor: { ...structuredClone(descriptor) },
      descriptorHash: scope.rewardProfileId,
      cutoff,
      snapshotEpoch: 2,
      snapshotEvidenceRevision: 7,
      expiresAt: new Date(cutoff.getTime() + 86400000),
      configVersion: descriptor.configVersion,
      contributorCheckpointIds: [],
      contributorRevisions: [],
      count: 0,
      medianExposure: 0,
      samples: [],
      validity: 'insufficient_baseline',
    };
    f.scopeRows.push(refreshScope(scope, descriptor));
    f.materializer.materialize.mockResolvedValue(row);
    expect(
      await f.service.reconcile('org', { credentialId: 'credential' }),
    ).toEqual({ status: 'completed', queued: 0, failed: 0 });
    expect(f.materializer.materialize).toHaveBeenCalledExactlyOnceWith(
      scope,
      descriptor,
      expect.any(Date),
    );
    expect(f.queue.queueSystemWorkflow).not.toHaveBeenCalled();
    expect(f.policies.rebuild).not.toHaveBeenCalled();
    expect(f.prisma.post.findMany).not.toHaveBeenCalled();
  });
  it('validates the real pending checkpoint output with an actual null checkpoint ID', async () => {
    const run = await engineRun(CONTENT_LEARNING_ACTION_IDS.CHECKPOINT, {
      postId: 'post',
    });
    expect(run.result.status).toBe('completed');
    expect(run.result.nodeResults.get('learning-action')?.output).toEqual({
      status: 'pending',
      checkpointId: null,
      reason: 'observation_receipt_missing',
    });
  });
  it.each([
    'missing-org',
    'deleted-org',
    'foreign-brand',
    'foreign-credential',
  ])(
    'refuses %s parents without materializer or scope writes',
    async (mutation) => {
      const f = await fixture();
      if (mutation === 'missing-org')
        f.prisma.organization.findFirst.mockResolvedValue(null);
      if (mutation === 'deleted-org')
        f.prisma.organization.findFirst.mockResolvedValue({
          id: 'org',
          isDeleted: true,
        });
      if (mutation === 'foreign-brand')
        f.prisma.brand.findFirst.mockResolvedValue({
          id: 'brand',
          organizationId: 'foreign',
          isDeleted: false,
          isActive: true,
        });
      if (mutation === 'foreign-credential')
        f.prisma.credential.findFirst.mockResolvedValue({
          id: 'credential',
          organizationId: 'foreign',
          brandId: 'brand',
          isDeleted: false,
          isConnected: true,
          platform: 'TWITTER',
        });
      expect(
        await f.service.reconcile('org', { credentialId: 'credential' }),
      ).toMatchObject({
        status: 'unavailable',
        reason: 'account_unavailable',
        queued: 0,
        failed: 0,
      });
      expect(
        f.prisma.contentLearningScopeState.findMany,
      ).not.toHaveBeenCalled();
      expect(f.materializer.materialize).not.toHaveBeenCalled();
    },
  );
  it.each([
    'foreign',
    'deleted',
    'disabled',
    'empty-id',
    'empty-brand',
    'empty-credential',
    'epoch',
    'evidence',
    'revision',
  ])(
    'skips malformed %s sweep row without queue authority',
    async (mutation) => {
      const f = await fixture(),
        row = refreshAccount();
      if (mutation === 'foreign') row.organizationId = 'foreign';
      if (mutation === 'deleted') row.isDeleted = true;
      if (mutation === 'disabled') row.mode = 'disabled';
      if (mutation === 'empty-id') row.id = '';
      if (mutation === 'empty-brand') row.brandId = '';
      if (mutation === 'empty-credential') row.credentialId = '';
      if (mutation === 'epoch') row.epoch = -1;
      if (mutation === 'evidence') row.evidenceRevision = 2147483648;
      if (mutation === 'revision') row.revision = 0.5;
      f.accountRows.push(row);
      expect(
        await f.service.reconcile('org', { materializationOnly: true }),
      ).toEqual({ status: 'completed', queued: 0, failed: 0 });
      expect(f.queue.queueSystemWorkflow).not.toHaveBeenCalled();
    },
  );
  it('uses exact live parent queries for targeted recovery', async () => {
    const f = await fixture();
    await f.service.reconcile('org', { credentialId: 'credential' });
    expect(
      f.prisma.contentLearningAccount.findFirst,
    ).toHaveBeenCalledExactlyOnceWith({
      where: {
        organizationId: 'org',
        credentialId: 'credential',
        isDeleted: false,
        mode: { not: 'disabled' },
      },
    });
    expect(f.prisma.organization.findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'org', isDeleted: false },
    });
    expect(f.prisma.brand.findFirst).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: 'brand',
        organizationId: 'org',
        isDeleted: false,
        isActive: true,
      },
    });
    expect(f.prisma.credential.findFirst).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: 'credential',
        organizationId: 'org',
        brandId: 'brand',
        isDeleted: false,
        isConnected: true,
      },
    });
  });
  it('propagates scope continuation rejection after bounded work so the same cursor can retry', async () => {
    const f = await fixture(),
      { scope, descriptor } = currentScope(),
      error = new Error('scope queue');
    for (let i = 0; i < 9; i++)
      f.scopeRows.push({
        ...refreshScope(scope, descriptor),
        id: `scope-${i}`,
      });
    f.queue.queueSystemWorkflow.mockRejectedValueOnce(error);
    await expect(
      f.service.reconcile('org', {
        credentialId: 'credential',
        refreshBucket: 0,
      }),
    ).rejects.toBe(error);
    expect(f.materializer.materialize).toHaveBeenCalledTimes(8);
    expect(
      await f.service.reconcile('org', {
        credentialId: 'credential',
        refreshBucket: 0,
      }),
    ).toEqual({ status: 'completed', queued: 1, failed: 0 });
    expect(f.queue.queueSystemWorkflow.mock.calls[0]?.[1]).toBe(
      f.queue.queueSystemWorkflow.mock.calls[1]?.[1],
    );
  });
  it('preserves account rebuild dispatch and its nullable policy output', async () => {
    const f = await fixture();
    expect(
      await f.service.execute(
        CONTENT_LEARNING_ACTION_IDS.ACCOUNT_REBUILD,
        'org',
        { credentialId: 'credential', scopeKey: 'scope' },
      ),
    ).toEqual({ status: 'unavailable', policyId: null });
    expect(f.policies.rebuild).toHaveBeenCalledExactlyOnceWith(
      'org',
      'credential',
      'scope',
    );
    expect(f.materializer.materialize).not.toHaveBeenCalled();
  });
  it('preserves exclusive retention and factual checkpoint/decision invalidation order', async () => {
    const f = await fixture();
    f.prisma.$transaction.mockImplementation(
      async (apply: (tx: unknown) => unknown) => apply(f.prisma),
    );
    f.prisma.contentLearningDecision.findMany.mockResolvedValue([
      { id: 'old-decision' },
    ]);
    f.prisma.contentLearningCheckpoint.findMany.mockResolvedValue([
      { id: 'old-checkpoint' },
    ]);
    f.prisma.contentLearningDecision.updateMany.mockResolvedValue({ count: 1 });
    expect(await f.service.retention('org')).toEqual({
      status: 'completed',
      removed: 2,
    });
    expect(f.prisma.$queryRaw.mock.calls[0]?.[0].join('')).toContain(
      'pg_advisory_xact_lock(5728, 1)',
    );
    expect(
      f.dependencies.invalidate.mock.calls.map(([kind, id]) => [kind, id]),
    ).toEqual([
      ['decision', 'old-decision'],
      ['checkpoint', 'old-checkpoint'],
    ]);
    expect(f.materializer.materialize).not.toHaveBeenCalled();
  });
});
