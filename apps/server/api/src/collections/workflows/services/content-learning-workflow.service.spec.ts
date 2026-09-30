import type { LearningCheckpointService } from '@api/collections/content-learning/services/learning-checkpoint.service';
import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import type { LearningPolicyService } from '@api/collections/content-learning/services/learning-policy.service';
import type { LearningRunService } from '@api/collections/content-learning/services/learning-run.service';
import { ContentLearningWorkflowService } from '@api/collections/workflows/services/content-learning-workflow.service';
import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { CONTENT_LEARNING_ACTION_IDS } from '@api/collections/workflows/templates/content-learning-workflows.template';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
function fixture() {
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
      findFirst: vi.fn().mockResolvedValue({ mode: 'shadow' }),
    },
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
    runs = { execute: vi.fn().mockResolvedValue({}) },
    checkpoints = {
      fulfilledWindow: vi.fn().mockResolvedValue(null),
      latestAttempt: vi.fn().mockResolvedValue(null),
    };
  return {
    prisma,
    queue,
    runner,
    runs,
    checkpoints,
    service: new ContentLearningWorkflowService(
      prisma as unknown as PrismaService,
      queue as unknown as WorkflowExecutionQueueService,
      runner as unknown as SystemWorkflowRunnerService,
      {} as LearningPolicyService,
      runs as unknown as LearningRunService,
      {} as LearningDependencyService,
      checkpoints as unknown as LearningCheckpointService,
    ),
  };
}
describe('durable scoped content learning workflow dispatch', () => {
  afterEach(() => vi.useRealTimers());
  it('queues the fixed-age checkpoint on background with the immutable post/window key', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    const f = fixture();
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
    const f = fixture();
    f.prisma.contentLearningAccount.findFirst.mockResolvedValue({
      mode: 'disabled',
    });
    expect(await f.service.queueCheckpoint('org', 'post')).toBeNull();
    expect(f.queue.queueSystemWorkflow).not.toHaveBeenCalled();
  });
  it('suppresses queue replacement for an already fulfilled publication window', async () => {
    const f = fixture();
    f.checkpoints.fulfilledWindow.mockResolvedValue({ id: 'checkpoint' });
    expect(await f.service.queueCheckpoint('org', 'post')).toBeNull();
    expect(f.queue.queueSystemWorkflow).not.toHaveBeenCalled();
  });
  it('never reports a Bull success as an observed checkpoint without a persisted receipt', async () => {
    const f = fixture();
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
    const f = fixture(),
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
    const f = fixture();
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
    const f = fixture();
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
  it('registers all six versioned graphs', () => {
    const f = fixture();
    f.service.onModuleInit();
    expect(f.runner.registerWorkflow).toHaveBeenCalledTimes(6);
  });
  it('disposes poisoned dispatch receipts and continues the remaining sweep', async () => {
    const f = fixture();
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
