import type { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import type { BatchGenerationReviewService } from '@api/services/batch-generation/batch-generation-review.service';
import { BatchGenerationRewriteService } from '@api/services/batch-generation/batch-generation-rewrite.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  BatchItemStatus,
  ReviewDecision,
} from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updatedAt = new Date('2026-09-27T10:00:00Z');
const items = [
  {
    id: 'item-1',
    status: BatchItemStatus.COMPLETED,
    reviewDecision: ReviewDecision.UNSET,
    caption: 'Old',
    platform: 'linkedin',
    postId: 'post-1',
  },
];
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
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'post-1',
          description: 'Old',
          platform: 'linkedin',
          updatedAt,
          targetExecutionState: 'draft',
        },
      ]),
    },
  };
  const generation = {
    enhanceDescription: vi.fn().mockResolvedValue('Rewritten'),
  };
  const review = {
    applyRewrites: vi.fn().mockResolvedValue({ id: 'batch-1' }),
  };
  const activities = {
    create: vi.fn().mockResolvedValue({ id: 'activity-1' }),
    patch: vi.fn(),
  };
  const websocket = { publishBackgroundTaskUpdate: vi.fn() };
  const service = new BatchGenerationRewriteService(
    prisma as unknown as PrismaService,
    generation as unknown as PostGenerationService,
    review as unknown as BatchGenerationReviewService,
    activities as unknown as ActivitiesService,
    websocket as unknown as NotificationsPublisherService,
  );
  return { service, prisma, generation, review, activities, websocket };
}

describe('Batch rewrite', () => {
  beforeEach(() => vi.clearAllMocks());
  it('enhances only selected items and publishes progress through completion', async () => {
    const { service, prisma, generation, review, activities, websocket } =
      setup();
    await service.rewriteItems(
      'batch-1',
      ['item-1', 'item-1'],
      'org-1',
      'user-1',
    );
    expect(prisma.batch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'batch-1', organizationId: 'org-1', isDeleted: false },
      }),
    );
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          brandId: 'brand-1',
          isDeleted: false,
        }),
      }),
    );
    expect(generation.enhanceDescription).toHaveBeenCalledOnce();
    expect(review.applyRewrites).toHaveBeenCalledWith(
      'batch-1',
      'org-1',
      'user-1',
      updatedAt,
      new Map([['item-1', 'Rewritten']]),
      new Map([['post-1', updatedAt]]),
    );
    expect(activities.patch).toHaveBeenCalledWith(
      'activity-1',
      expect.objectContaining({
        key: ActivityKey.POST_GENERATED,
        isRead: false,
      }),
    );
    expect(
      websocket.publishBackgroundTaskUpdate.mock.calls.map(
        ([event]) => event.status,
      ),
    ).toEqual(['processing', 'processing', 'completed']);
  });
  it('rejects a different tenant without generating or creating an activity', async () => {
    const { service, prisma, generation, activities } = setup();
    prisma.batch.findFirst.mockResolvedValue(null);
    await expect(
      service.rewriteItems('batch-1', ['item-1'], 'other-org', 'user-1'),
    ).rejects.toThrow();
    expect(generation.enhanceDescription).not.toHaveBeenCalled();
    expect(activities.create).not.toHaveBeenCalled();
  });
  it('rejects foreign item IDs before generation', async () => {
    const { service, generation } = setup();
    await expect(
      service.rewriteItems('batch-1', ['foreign-item'], 'org-1', 'user-1'),
    ).rejects.toThrow();
    expect(generation.enhanceDescription).not.toHaveBeenCalled();
  });
  it('records failure and leaves content unchanged if generation fails', async () => {
    const { service, generation, review, activities, websocket } = setup();
    generation.enhanceDescription.mockRejectedValue(
      new Error('Provider unavailable'),
    );
    await expect(
      service.rewriteItems('batch-1', ['item-1'], 'org-1', 'user-1'),
    ).rejects.toThrow('Provider unavailable');
    expect(review.applyRewrites).not.toHaveBeenCalled();
    expect(activities.patch).toHaveBeenCalledWith(
      'activity-1',
      expect.objectContaining({ key: ActivityKey.POST_FAILED }),
    );
    expect(websocket.publishBackgroundTaskUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });
});
