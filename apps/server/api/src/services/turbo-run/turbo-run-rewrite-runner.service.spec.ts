import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { InsufficientCreditsException } from '@api/exceptions/business-logic.exception';
import type { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { TurboRewriteJob } from '@api/services/turbo-run/turbo-rewrite-job.util';
import type { TurboRunReviewService } from '@api/services/turbo-run/turbo-run-review.service';
import { TurboRunRewriteRunnerService } from '@api/services/turbo-run/turbo-run-rewrite-runner.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  ActivitySource,
  CreditReservationStatus,
  ReviewDecision,
  TurboRewriteItemFailureReason,
  TurboRewriteJobStatus,
  TurboRunItemStatus,
} from '@genfeedai/contracts';
import type {
  TurboRewriteJobData,
  TurboRewriteJobResult,
} from '@genfeedai/contracts/queue';
import type { LoggerService } from '@libs/logger/logger.service';
import { ConflictException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updatedAt = new Date('2026-09-27T10:00:00Z');
const items = [
  {
    id: 'item-1',
    status: TurboRunItemStatus.COMPLETED,
    reviewDecision: ReviewDecision.UNSET,
    caption: 'Old one',
    platform: 'linkedin',
    postId: 'post-1',
  },
  {
    id: 'item-2',
    status: TurboRunItemStatus.COMPLETED,
    reviewDecision: ReviewDecision.UNSET,
    caption: 'Old two',
    platform: 'linkedin',
    postId: 'post-2',
  },
];
const data: TurboRewriteJobData = {
  activityId: 'activity-1',
  turboRunId: 'run-1',
  brandId: 'brand-1',
  credits: {
    amountPerItem: 2,
    description: 'Turbo rewrite (text model)',
    source: ActivitySource.POST_ENHANCEMENT,
  },
  itemIds: ['item-1', 'item-2'],
  organizationId: 'org-1',
  postVersions: {
    'post-1': updatedAt.toISOString(),
    'post-2': updatedAt.toISOString(),
  },
  userId: 'user-1',
};

function setup(progress: unknown = 0) {
  const job = {
    data,
    id: 'job-1',
    progress,
    updateProgress: vi.fn(),
  };
  const queue = {
    getJob: vi.fn().mockResolvedValue({ data }),
  };
  const prisma = {
    turboRun: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'run-1',
        brandId: 'brand-1',
        items,
        updatedAt,
      }),
    },
    post: {
      findFirst: vi.fn(({ where }: { where: { id: string } }) => ({
        id: where.id,
        description: `Draft ${where.id}`,
        platform: 'linkedin',
        targetExecutionState: 'draft',
        updatedAt,
      })),
    },
  };
  const generation = {
    enhanceDescription: vi.fn(
      async ({ description }: { description: string }) =>
        `Rewritten ${description}`,
    ),
  };
  const review = { applyRewrites: vi.fn().mockResolvedValue({}) };
  const activities = { update: vi.fn() };
  const websocket = { publishBackgroundTaskUpdate: vi.fn() };
  const credits = {
    releaseReservation: vi.fn(),
    reserveCredits: vi.fn(
      async ({ idempotencyKey }: { idempotencyKey: string }) => ({
        id: `reservation:${idempotencyKey}`,
        status: CreditReservationStatus.RESERVED,
      }),
    ),
  };
  const deductions = { queueDeduction: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const runner = new TurboRunRewriteRunnerService(
    queue as unknown as Queue<TurboRewriteJobData, TurboRewriteJobResult>,
    prisma as unknown as PrismaService,
    generation as unknown as PostGenerationService,
    review as unknown as TurboRunReviewService,
    activities as unknown as ActivityRecorderService,
    websocket as unknown as NotificationsPublisherService,
    credits as unknown as CreditsUtilsService,
    deductions as unknown as CreditDeductionQueueService,
    logger as unknown as LoggerService,
  );
  return {
    activities,
    credits,
    deductions,
    generation,
    job,
    prisma,
    queue,
    review,
    run: () => runner.run(job as unknown as TurboRewriteJob),
    websocket,
  };
}

describe('TurboRunRewriteRunnerService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reserves, rewrites, applies, and settles each item on its own', async () => {
    const {
      activities,
      credits,
      deductions,
      generation,
      job,
      prisma,
      review,
      run,
      websocket,
    } = setup();

    await expect(run()).resolves.toEqual({
      completedItemIds: ['item-1', 'item-2'],
      failedItems: [],
      status: TurboRewriteJobStatus.COMPLETED,
    });

    expect(prisma.turboRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1', organizationId: 'org-1', isDeleted: false },
      }),
    );
    expect(prisma.post.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'post-1',
        organizationId: 'org-1',
        brandId: 'brand-1',
        isDeleted: false,
      },
    });
    expect(credits.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user-1',
        amount: 2,
        brandId: 'brand-1',
        idempotencyKey: 'turbo-rewrite:job-1:item-1',
        organizationId: 'org-1',
        workloadId: 'job-1',
      }),
    );
    expect(generation.enhanceDescription).toHaveBeenCalledTimes(2);
    expect(review.applyRewrites).toHaveBeenNthCalledWith(
      1,
      'run-1',
      'org-1',
      'user-1',
      new Map([['item-1', 'Rewritten Draft post-1']]),
      new Map([['post-1', updatedAt]]),
      'job-1',
    );
    expect(deductions.queueDeduction).toHaveBeenCalledTimes(2);
    expect(deductions.queueDeduction).toHaveBeenCalledWith({
      amount: 2,
      brandId: 'brand-1',
      description: 'Turbo rewrite (text model)',
      idempotencyKey: 'turbo-rewrite-job-1-item-2',
      organizationId: 'org-1',
      reservationId: 'reservation:turbo-rewrite:job-1:item-2',
      source: ActivitySource.POST_ENHANCEMENT,
      type: 'deduct-credits',
      userId: 'user-1',
    });
    expect(credits.releaseReservation).not.toHaveBeenCalled();
    expect(job.updateProgress).toHaveBeenLastCalledWith({
      completedItemIds: ['item-1', 'item-2'],
      failedItems: [],
    });
    expect(activities.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'activity-1' }),
      expect.objectContaining({ key: ActivityKey.POST_GENERATED }),
    );
    expect(
      websocket.publishBackgroundTaskUpdate.mock.calls.map(([event]) => [
        event.status,
        event.progress,
        event.taskId,
      ]),
    ).toEqual([
      ['processing', 0, 'job-1'],
      ['processing', 50, 'job-1'],
      ['processing', 99, 'job-1'],
      ['completed', 100, 'job-1'],
    ]);
  });

  it('keeps completed captions and releases the credits of a failed item', async () => {
    const { credits, deductions, generation, review, run } = setup();
    generation.enhanceDescription
      .mockResolvedValueOnce('Rewritten one')
      .mockRejectedValueOnce(new Error('Provider unavailable'));

    await expect(run()).resolves.toEqual({
      completedItemIds: ['item-1'],
      failedItems: [
        {
          itemId: 'item-2',
          reason: TurboRewriteItemFailureReason.GENERATION_FAILED,
        },
      ],
      status: TurboRewriteJobStatus.PARTIALLY_FAILED,
    });
    expect(review.applyRewrites).toHaveBeenCalledOnce();
    expect(deductions.queueDeduction).toHaveBeenCalledOnce();
    expect(credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'reservation:turbo-rewrite:job-1:item-2',
    });
  });

  it('skips a draft edited after queueing without generating or charging', async () => {
    const { credits, deductions, generation, prisma, run } = setup();
    prisma.post.findFirst.mockImplementation(
      ({ where }: { where: { id: string } }) => ({
        id: where.id,
        description: 'Edited',
        platform: 'linkedin',
        targetExecutionState: 'draft',
        updatedAt:
          where.id === 'post-1' ? new Date('2026-09-27T10:05:00Z') : updatedAt,
      }),
    );

    const result = await run();

    expect(result.failedItems).toEqual([
      { itemId: 'item-1', reason: TurboRewriteItemFailureReason.CONFLICT },
    ]);
    expect(result.status).toBe(TurboRewriteJobStatus.PARTIALLY_FAILED);
    expect(generation.enhanceDescription).toHaveBeenCalledOnce();
    expect(deductions.queueDeduction).toHaveBeenCalledOnce();
    expect(credits.releaseReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: 'reservation:turbo-rewrite:job-1:item-1',
      }),
    );
  });

  it('treats a lost optimistic lock during apply as a conflict', async () => {
    const { credits, deductions, review, run } = setup();
    review.applyRewrites.mockRejectedValue(
      new ConflictException('Post changed during rewrite.'),
    );

    const result = await run();

    expect(result.status).toBe(TurboRewriteJobStatus.FAILED);
    expect(result.failedItems.map((failure) => failure.reason)).toEqual([
      TurboRewriteItemFailureReason.CONFLICT,
      TurboRewriteItemFailureReason.CONFLICT,
    ]);
    expect(deductions.queueDeduction).not.toHaveBeenCalled();
    expect(credits.releaseReservation).toHaveBeenCalledTimes(2);
  });

  it('fails items the balance no longer covers without generating them', async () => {
    const { activities, credits, generation, run, websocket } = setup();
    credits.reserveCredits.mockRejectedValue(
      new InsufficientCreditsException(2, 0),
    );

    const result = await run();

    expect(result).toEqual({
      completedItemIds: [],
      failedItems: [
        {
          itemId: 'item-1',
          reason: TurboRewriteItemFailureReason.INSUFFICIENT_CREDITS,
        },
        {
          itemId: 'item-2',
          reason: TurboRewriteItemFailureReason.INSUFFICIENT_CREDITS,
        },
      ],
      status: TurboRewriteJobStatus.FAILED,
    });
    expect(generation.enhanceDescription).not.toHaveBeenCalled();
    expect(activities.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'activity-1' }),
      expect.objectContaining({ key: ActivityKey.POST_FAILED }),
    );
    expect(websocket.publishBackgroundTaskUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('stops before the next item once cancellation is requested', async () => {
    const { deductions, generation, queue, run, websocket } = setup();
    queue.getJob
      .mockResolvedValueOnce({ data })
      .mockResolvedValue({ data: { ...data, isCancelRequested: true } });

    await expect(run()).resolves.toEqual({
      completedItemIds: ['item-1'],
      failedItems: [],
      status: TurboRewriteJobStatus.CANCELLED,
    });
    expect(generation.enhanceDescription).toHaveBeenCalledOnce();
    expect(deductions.queueDeduction).toHaveBeenCalledOnce();
    expect(websocket.publishBackgroundTaskUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('resumes after a stall without redoing or re-billing finished items', async () => {
    const { credits, deductions, generation, run } = setup({
      completedItemIds: ['item-1'],
      failedItems: [],
    });

    await expect(run()).resolves.toMatchObject({
      completedItemIds: ['item-1', 'item-2'],
      status: TurboRewriteJobStatus.COMPLETED,
    });
    expect(generation.enhanceDescription).toHaveBeenCalledOnce();
    expect(credits.reserveCredits).toHaveBeenCalledOnce();
    expect(deductions.queueDeduction).toHaveBeenCalledOnce();
  });

  it('counts an item billed before a stall as rewritten', async () => {
    const { credits, deductions, generation, run } = setup();
    credits.reserveCredits.mockResolvedValueOnce({
      id: 'reservation-1',
      status: CreditReservationStatus.SETTLED,
    });

    await expect(run()).resolves.toMatchObject({
      completedItemIds: ['item-1', 'item-2'],
    });
    expect(generation.enhanceDescription).toHaveBeenCalledOnce();
    expect(deductions.queueDeduction).toHaveBeenCalledOnce();
  });

  describe('when the worker stopped after committing a caption', () => {
    const editedAt = new Date('2026-09-27T10:05:00Z');

    function markItemOne(rewriteJobId: string) {
      return {
        id: 'run-1',
        brandId: 'brand-1',
        items: [
          {
            ...items[0],
            reviewEvents: [
              {
                decision: ReviewDecision.REQUEST_CHANGES,
                feedback: 'Content rewritten',
                reviewedAt: editedAt.toISOString(),
                reviewerId: 'user-1',
                rewriteJobId,
              },
            ],
          },
          items[1],
        ],
        updatedAt,
      };
    }

    function bumpPostOne(prisma: ReturnType<typeof setup>['prisma']) {
      // The committed rewrite bumped post-1 past the queued version.
      prisma.post.findFirst.mockImplementation(
        ({ where }: { where: { id: string } }) => ({
          id: where.id,
          description: `Draft ${where.id}`,
          platform: 'linkedin',
          targetExecutionState: 'draft',
          updatedAt: where.id === 'post-1' ? editedAt : updatedAt,
        }),
      );
    }

    it('settles the committed item once instead of reading it as an edit', async () => {
      const { credits, deductions, generation, prisma, review, run } = setup();
      prisma.turboRun.findFirst.mockResolvedValue(markItemOne('job-1'));
      bumpPostOne(prisma);

      await expect(run()).resolves.toEqual({
        completedItemIds: ['item-1', 'item-2'],
        failedItems: [],
        status: TurboRewriteJobStatus.COMPLETED,
      });
      // Only item-2 is generated and applied; item-1 is only billed.
      expect(generation.enhanceDescription).toHaveBeenCalledOnce();
      expect(review.applyRewrites).toHaveBeenCalledOnce();
      expect(deductions.queueDeduction).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'turbo-rewrite-job-1-item-1',
          reservationId: 'reservation:turbo-rewrite:job-1:item-1',
        }),
      );
      expect(deductions.queueDeduction).toHaveBeenCalledTimes(2);
      expect(credits.releaseReservation).not.toHaveBeenCalled();
    });

    it("still treats another job's rewrite as a reviewer's edit", async () => {
      const { credits, deductions, prisma, run } = setup();
      prisma.turboRun.findFirst.mockResolvedValue(markItemOne('job-0'));
      bumpPostOne(prisma);

      const result = await run();

      expect(result.failedItems).toEqual([
        { itemId: 'item-1', reason: TurboRewriteItemFailureReason.CONFLICT },
      ]);
      expect(deductions.queueDeduction).toHaveBeenCalledOnce();
      expect(credits.releaseReservation).toHaveBeenCalledWith(
        expect.objectContaining({
          reservationId: 'reservation:turbo-rewrite:job-1:item-1',
        }),
      );
    });

    it('retries a settlement that could not be queued and bills it exactly once', async () => {
      const first = setup();
      first.deductions.queueDeduction.mockRejectedValueOnce(
        new Error('Redis unavailable'),
      );

      await expect(first.run()).rejects.toThrow('Redis unavailable');
      // The caption committed, so its hold is kept for the retry.
      expect(first.credits.releaseReservation).not.toHaveBeenCalled();
      expect(first.job.updateProgress).not.toHaveBeenCalled();

      // BullMQ retries the job: item-1 now carries this job's marker.
      const retry = setup();
      retry.prisma.turboRun.findFirst.mockResolvedValue(markItemOne('job-1'));
      bumpPostOne(retry.prisma);

      await expect(retry.run()).resolves.toMatchObject({
        completedItemIds: ['item-1', 'item-2'],
        status: TurboRewriteJobStatus.COMPLETED,
      });
      expect(retry.generation.enhanceDescription).toHaveBeenCalledOnce();
      expect(retry.deductions.queueDeduction).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'turbo-rewrite-job-1-item-1',
          reservationId: 'reservation:turbo-rewrite:job-1:item-1',
        }),
      );
    });
  });

  it('opens a fresh hold when an earlier attempt released the item', async () => {
    const { credits, run } = setup();
    credits.reserveCredits.mockResolvedValueOnce({
      id: 'released',
      status: CreditReservationStatus.RELEASED,
    });

    await run();

    expect(credits.reserveCredits).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(
          /^turboRun-rewrite:job-1:item-1:retry:/,
        ),
      }),
    );
  });

  it('releases the hold and fails the job on an infrastructure error', async () => {
    const { activities, credits, deductions, review, run, websocket } = setup();
    review.applyRewrites.mockRejectedValue(new Error('Database unavailable'));

    await expect(run()).rejects.toThrow('Database unavailable');
    expect(credits.releaseReservation).toHaveBeenCalledOnce();
    expect(deductions.queueDeduction).not.toHaveBeenCalled();
    expect(activities.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'activity-1' }),
      expect.objectContaining({ key: ActivityKey.POST_FAILED }),
    );
    expect(websocket.publishBackgroundTaskUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        error: 'Database unavailable',
        status: 'failed',
      }),
    );
  });

  it('never rewrites a post that shipped after queueing', async () => {
    const { credits, generation, prisma, run } = setup();
    prisma.post.findFirst.mockImplementation(
      ({ where }: { where: { id: string } }) => ({
        id: where.id,
        description: 'Shipped',
        platform: 'linkedin',
        targetExecutionState: 'published',
        updatedAt,
      }),
    );

    const result = await run();

    expect(result.failedItems.map((failure) => failure.reason)).toEqual([
      TurboRewriteItemFailureReason.NOT_REWRITABLE,
      TurboRewriteItemFailureReason.NOT_REWRITABLE,
    ]);
    expect(generation.enhanceDescription).not.toHaveBeenCalled();
    expect(credits.releaseReservation).toHaveBeenCalledTimes(2);
  });
});
