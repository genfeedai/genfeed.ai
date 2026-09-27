import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { BatchGenerationRewriteService } from '@api/services/batch-generation/batch-generation-rewrite.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  ActivitySource,
  BatchItemStatus,
  BatchRewriteJobStatus,
  ReviewDecision,
} from '@genfeedai/contracts';
import type {
  BatchRewriteJobData,
  BatchRewriteJobResult,
} from '@genfeedai/contracts/queue';
import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updatedAt = new Date('2026-09-27T10:00:00Z');
const credits = {
  amountPerItem: 1,
  description: 'Batch rewrite (text model)',
  source: ActivitySource.POST_ENHANCEMENT,
};
const items = [
  {
    id: 'item-1',
    status: BatchItemStatus.COMPLETED,
    reviewDecision: ReviewDecision.UNSET,
    caption: 'Old',
    platform: 'linkedin',
    postId: 'post-1',
  },
  {
    id: 'item-2',
    status: BatchItemStatus.COMPLETED,
    reviewDecision: ReviewDecision.UNSET,
    caption: 'Old two',
    platform: 'linkedin',
  },
];

function storedJob(
  data: Partial<BatchRewriteJobData>,
  state = 'active',
  extra: { progress?: unknown; returnvalue?: BatchRewriteJobResult } = {},
) {
  return {
    data: {
      activityId: 'activity-1',
      batchId: 'batch-1',
      brandId: 'brand-1',
      credits,
      itemIds: ['item-1'],
      organizationId: 'org-1',
      postVersions: {},
      userId: 'user-1',
      ...data,
    },
    getState: vi.fn().mockResolvedValue(state),
    id: 'job-1',
    progress: extra.progress ?? 0,
    returnvalue: extra.returnvalue ?? null,
    updateData: vi.fn(),
  };
}

function setup() {
  const prisma = {
    batch: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'batch-1',
        brandId: 'brand-1',
        items,
        updatedAt,
      }),
    },
    post: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: 'post-1', updatedAt, targetExecutionState: 'draft' },
        ]),
    },
  };
  const queue = {
    add: vi.fn(
      async (_name: string, _data: unknown, opts: { jobId: string }) => ({
        id: opts.jobId,
      }),
    ),
    getDeduplicationJobId: vi.fn().mockResolvedValue(null),
    getJob: vi.fn().mockResolvedValue(undefined),
  };
  const activities = {
    record: vi.fn().mockResolvedValue({ id: 'activity-1' }),
    update: vi.fn(),
  };
  const websocket = { publishBackgroundTaskUpdate: vi.fn() };
  const service = new BatchGenerationRewriteService(
    queue as unknown as Queue<BatchRewriteJobData, BatchRewriteJobResult>,
    prisma as unknown as PrismaService,
    activities as unknown as ActivityRecorderService,
    websocket as unknown as NotificationsPublisherService,
  );
  return { activities, prisma, queue, service, websocket };
}

describe('BatchGenerationRewriteService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queues one job per batch with the post version lock and returns at once', async () => {
    const { activities, prisma, queue, service, websocket } = setup();

    const job = await service.enqueue({
      batchId: 'batch-1',
      credits,
      itemIds: ['item-1', 'item-2', 'item-1'],
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(prisma.batch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'batch-1', organizationId: 'org-1', isDeleted: false },
      }),
    );
    expect(prisma.post.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['post-1'] },
        organizationId: 'org-1',
        isDeleted: false,
        brandId: 'brand-1',
      },
    });
    expect(queue.add).toHaveBeenCalledWith(
      'rewrite-items',
      {
        activityId: 'activity-1',
        batchId: 'batch-1',
        brandId: 'brand-1',
        credits,
        itemIds: ['item-1', 'item-2'],
        organizationId: 'org-1',
        postVersions: { 'post-1': updatedAt.toISOString() },
        userId: 'user-1',
      },
      {
        deduplication: { id: 'batch-rewrite-batch-1' },
        jobId: expect.stringMatching(/^batch-rewrite-batch-1-/),
      },
    );
    expect(job).toMatchObject({
      batchId: 'batch-1',
      completedItemIds: [],
      failedItems: [],
      itemIds: ['item-1', 'item-2'],
      status: BatchRewriteJobStatus.QUEUED,
    });
    expect(activities.record).toHaveBeenCalledOnce();
    expect(websocket.publishBackgroundTaskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', taskId: job.id }),
    );
  });

  it('rejects a different tenant before queueing anything', async () => {
    const { activities, prisma, queue, service } = setup();
    prisma.batch.findFirst.mockResolvedValue(null);

    await expect(
      service.enqueue({
        batchId: 'batch-1',
        credits,
        itemIds: ['item-1'],
        organizationId: 'other-org',
        userId: 'user-1',
      }),
    ).rejects.toThrow();
    expect(queue.add).not.toHaveBeenCalled();
    expect(activities.record).not.toHaveBeenCalled();
  });

  it.each([
    {
      brandId: null,
      itemIds: ['item-1'],
      label: 'a brandless batch',
      message: 'Rewrite needs a brand-scoped batch',
    },
    {
      brandId: 'brand-1',
      itemIds: ['foreign'],
      label: 'foreign item IDs',
      message: 'Select completed items from this batch',
    },
  ])(
    'rejects $label before queueing',
    async ({ brandId, itemIds, message }) => {
      const { prisma, queue, service } = setup();
      prisma.batch.findFirst.mockResolvedValue({
        id: 'batch-1',
        brandId,
        items,
        updatedAt,
      });

      await expect(
        service.enqueue({
          batchId: 'batch-1',
          credits,
          itemIds,
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      ).rejects.toThrow(message);
      expect(queue.add).not.toHaveBeenCalled();
    },
  );

  it('rejects a published post before queueing', async () => {
    const { prisma, queue, service } = setup();
    prisma.post.findMany.mockResolvedValue([
      { id: 'post-1', updatedAt, targetExecutionState: 'published' },
    ]);

    await expect(
      service.enqueue({
        batchId: 'batch-1',
        credits,
        itemIds: ['item-1'],
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow('This post can no longer be rewritten');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('refuses a second rewrite while one is running for the batch', async () => {
    const { activities, queue, service } = setup();
    queue.getDeduplicationJobId.mockResolvedValue('job-1');
    queue.getJob.mockResolvedValue(storedJob({}));

    await expect(
      service.enqueue({
        batchId: 'batch-1',
        credits,
        itemIds: ['item-1'],
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow('A rewrite is already running for this batch');
    expect(queue.add).not.toHaveBeenCalled();
    expect(activities.record).not.toHaveBeenCalled();
  });

  it('fails the activity when a concurrent request won the deduplication race', async () => {
    const { activities, queue, service, websocket } = setup();
    queue.add.mockResolvedValue({ id: 'someone-else' });

    await expect(
      service.enqueue({
        batchId: 'batch-1',
        credits,
        itemIds: ['item-1'],
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow('A rewrite is already running for this batch');
    // The losing request never ran: history keeps the row, no alert fires.
    expect(activities.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'activity-1' }),
      expect.objectContaining({
        alert: { channels: [] },
        key: ActivityKey.POST_FAILED,
      }),
    );
    expect(websocket.publishBackgroundTaskUpdate).not.toHaveBeenCalled();
  });

  it('reads per-item progress of an owned job', async () => {
    const { queue, service } = setup();
    queue.getJob.mockResolvedValue(
      storedJob({ itemIds: ['item-1', 'item-2'] }, 'active', {
        progress: {
          completedItemIds: ['item-1'],
          failedItems: [{ itemId: 'bogus' }],
        },
      }),
    );

    await expect(service.getJob('batch-1', 'job-1', 'org-1')).resolves.toEqual({
      batchId: 'batch-1',
      completedItemIds: ['item-1'],
      failedItems: [],
      id: 'job-1',
      isCancelRequested: false,
      itemIds: ['item-1', 'item-2'],
      status: BatchRewriteJobStatus.PROCESSING,
    });
  });

  it('reports the final outcome of a finished job', async () => {
    const { queue, service } = setup();
    queue.getJob.mockResolvedValue(
      storedJob({}, 'completed', {
        returnvalue: {
          completedItemIds: [],
          failedItems: [],
          status: BatchRewriteJobStatus.CANCELLED,
        },
      }),
    );

    await expect(
      service.getJob('batch-1', 'job-1', 'org-1'),
    ).resolves.toMatchObject({ status: BatchRewriteJobStatus.CANCELLED });
  });

  it.each([
    ['another organization', { organizationId: 'other-org' }],
    ['another batch', { batchId: 'batch-2' }],
  ])('hides a job owned by %s', async (_label, data) => {
    const { queue, service } = setup();
    const job = storedJob(data);
    queue.getJob.mockResolvedValue(job);

    await expect(service.getJob('batch-1', 'job-1', 'org-1')).rejects.toThrow(
      "Batch rewrite with identifier 'job-1' not found",
    );
    await expect(service.cancel('batch-1', 'job-1', 'org-1')).rejects.toThrow();
    expect(job.updateData).not.toHaveBeenCalled();
  });

  it('flags a running job for cancellation', async () => {
    const { queue, service } = setup();
    const job = storedJob({});
    queue.getJob.mockResolvedValue(job);

    await expect(
      service.cancel('batch-1', 'job-1', 'org-1'),
    ).resolves.toMatchObject({ isCancelRequested: true });
    expect(job.updateData).toHaveBeenCalledWith(
      expect.objectContaining({ isCancelRequested: true }),
    );
  });

  it('leaves a finished job untouched on cancel', async () => {
    const { queue, service } = setup();
    const job = storedJob({}, 'completed', {
      returnvalue: {
        completedItemIds: ['item-1'],
        failedItems: [],
        status: BatchRewriteJobStatus.COMPLETED,
      },
    });
    queue.getJob.mockResolvedValue(job);

    await expect(
      service.cancel('batch-1', 'job-1', 'org-1'),
    ).resolves.toMatchObject({ status: BatchRewriteJobStatus.COMPLETED });
    expect(job.updateData).not.toHaveBeenCalled();
  });

  it('returns the active job only to its own organization', async () => {
    const { queue, service } = setup();
    queue.getDeduplicationJobId.mockResolvedValue('job-1');
    queue.getJob.mockResolvedValue(storedJob({}, 'waiting'));

    await expect(
      service.getActiveJob('batch-1', 'org-1'),
    ).resolves.toMatchObject({
      id: 'job-1',
      status: BatchRewriteJobStatus.QUEUED,
    });
    await expect(
      service.getActiveJob('batch-1', 'other-org'),
    ).resolves.toBeNull();
  });
});
