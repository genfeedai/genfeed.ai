import { BatchContentQueueService } from '@api/services/batch-content/batch-content-queue.service';
import type { BatchContentRequest } from '@api/services/batch-content/interfaces/batch-content.interfaces';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { ContentDraft } from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function createMockQueue(): Queue {
  return {
    add: vi
      .fn()
      .mockImplementation(
        async (_name: string, _data: unknown, options: { jobId: string }) => ({
          id: options.jobId,
        }),
      ),
  } as unknown as Queue;
}

function createMockNotifications(): NotificationsPublisherService {
  return {
    publishBackgroundTaskUpdate: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsPublisherService;
}

const defaultRequest: BatchContentRequest = {
  brandId: 'brand-1',
  count: 3,
  organizationId: 'org-1',
  params: { topic: 'test' },
  skillSlug: 'content-writing',
};

const sampleDraft: ContentDraft = {
  confidence: 0.9,
  content: 'draft content',
  metadata: {},
  platforms: ['twitter'],
  skillSlug: 'content-writing',
  type: 'text',
};

describe('BatchContentQueueService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('enqueueBatch', () => {
    it('should create jobs for each item in the batch', async () => {
      const queue = createMockQueue();
      const service = new BatchContentQueueService(
        queue,
        createMockLogger(),
        createMockNotifications(),
      );

      const { jobIds } = await service.enqueueBatch(defaultRequest, 'user-1');

      expect(queue.add).toHaveBeenCalledTimes(3);
      expect(jobIds).toHaveLength(3);
    });

    it('should pass correct job options with retry config', async () => {
      const queue = createMockQueue();
      const service = new BatchContentQueueService(
        queue,
        createMockLogger(),
        createMockNotifications(),
      );

      await service.enqueueBatch(defaultRequest, 'user-1');

      expect(queue.add).toHaveBeenCalledWith(
        'batch-item',
        expect.objectContaining({
          itemIndex: 0,
          request: defaultRequest,
          userId: 'user-1',
        }),
        expect.objectContaining({
          attempts: 3,
          backoff: { delay: 1000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        }),
      );
    });

    it('should initialize batch status as queued', async () => {
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        createMockNotifications(),
      );

      const { batchId } = await service.enqueueBatch(defaultRequest, 'user-1');
      const status = service.getBatchStatus(batchId, 'org-1', 'brand-1');

      expect(status.status).toBe('queued');
      expect(status.total).toBe(3);
      expect(status.completed).toBe(0);
      expect(status.failed).toBe(0);
    });

    it('should publish progress notification', async () => {
      const notifications = createMockNotifications();
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        notifications,
      );

      await service.enqueueBatch(defaultRequest, 'user-1');

      expect(notifications.publishBackgroundTaskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          room: 'user:user-1',
          status: 'pending',
          userId: 'user-1',
        }),
      );
    });

    it('should not publish notification when no userId', async () => {
      const notifications = createMockNotifications();
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        notifications,
      );

      await service.enqueueBatch(defaultRequest);

      expect(notifications.publishBackgroundTaskUpdate).not.toHaveBeenCalled();
    });
  });

  describe('getBatchStatus', () => {
    it('should throw NotFoundException for unknown batchId', () => {
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        createMockNotifications(),
      );

      expect(() =>
        service.getBatchStatus('unknown', 'org-1', 'brand-1'),
      ).toThrow(NotFoundException);
    });

    it('should throw NotFoundException when org does not match', async () => {
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        createMockNotifications(),
      );
      const { batchId } = await service.enqueueBatch(defaultRequest, 'user-1');

      expect(() =>
        service.getBatchStatus(batchId, 'wrong-org', 'brand-1'),
      ).toThrow(NotFoundException);
    });

    it('should throw NotFoundException when brand does not match', async () => {
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        createMockNotifications(),
      );
      const { batchId } = await service.enqueueBatch(defaultRequest, 'user-1');

      expect(() =>
        service.getBatchStatus(batchId, 'org-1', 'wrong-brand'),
      ).toThrow(NotFoundException);
    });

    it('should return a copy of results array', async () => {
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        createMockNotifications(),
      );
      const { batchId } = await service.enqueueBatch(defaultRequest, 'user-1');

      const status1 = service.getBatchStatus(batchId, 'org-1', 'brand-1');
      const status2 = service.getBatchStatus(batchId, 'org-1', 'brand-1');

      expect(status1.results).not.toBe(status2.results);
    });
  });

  describe('markItemProcessing', () => {
    it('should update status to processing', async () => {
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        createMockNotifications(),
      );
      const { batchId } = await service.enqueueBatch(defaultRequest, 'user-1');

      await service.markItemProcessing(batchId);
      const status = service.getBatchStatus(batchId, 'org-1', 'brand-1');

      expect(status.status).toBe('processing');
    });

    it('should silently ignore unknown batchId', async () => {
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        createMockNotifications(),
      );

      await expect(
        service.markItemProcessing('nonexistent'),
      ).resolves.toBeUndefined();
    });
  });

  describe('markItemCompleted', () => {
    it('should increment completed count and store draft', async () => {
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        createMockNotifications(),
      );
      const { batchId } = await service.enqueueBatch(
        { ...defaultRequest, count: 2 },
        'user-1',
      );

      await service.markItemCompleted(batchId, sampleDraft);
      const status = service.getBatchStatus(batchId, 'org-1', 'brand-1');

      expect(status.completed).toBe(1);
      expect(status.results).toHaveLength(1);
      expect(status.results[0].content).toBe('draft content');
    });

    it('should finalize batch as completed when all items done', async () => {
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        createMockNotifications(),
      );
      const { batchId } = await service.enqueueBatch(
        { ...defaultRequest, count: 2 },
        'user-1',
      );

      await service.markItemCompleted(batchId, sampleDraft);
      await service.markItemCompleted(batchId, sampleDraft);
      const status = service.getBatchStatus(batchId, 'org-1', 'brand-1');

      expect(status.status).toBe('completed');
      expect(status.completed).toBe(2);
    });
  });

  describe('markItemFailed', () => {
    it('should increment failed count', async () => {
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        createMockNotifications(),
      );
      const { batchId } = await service.enqueueBatch(
        { ...defaultRequest, count: 2 },
        'user-1',
      );

      await service.markItemFailed(batchId);
      const status = service.getBatchStatus(batchId, 'org-1', 'brand-1');

      expect(status.failed).toBe(1);
      expect(status.status).toBe('processing');
    });

    it('should finalize as failed when all items fail', async () => {
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        createMockNotifications(),
      );
      const { batchId } = await service.enqueueBatch(
        { ...defaultRequest, count: 2 },
        'user-1',
      );

      await service.markItemFailed(batchId);
      await service.markItemFailed(batchId);
      const status = service.getBatchStatus(batchId, 'org-1', 'brand-1');

      expect(status.status).toBe('failed');
      expect(status.failed).toBe(2);
    });

    it('should finalize as completed when mixed results with at least one success', async () => {
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        createMockNotifications(),
      );
      const { batchId } = await service.enqueueBatch(
        { ...defaultRequest, count: 3 },
        'user-1',
      );

      await service.markItemCompleted(batchId, sampleDraft);
      await service.markItemFailed(batchId);
      await service.markItemFailed(batchId);
      const status = service.getBatchStatus(batchId, 'org-1', 'brand-1');

      expect(status.status).toBe('completed');
      expect(status.completed).toBe(1);
      expect(status.failed).toBe(2);
    });
  });

  describe('getBatchDuration', () => {
    it('should throw NotFoundException for unknown batch', () => {
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        createMockNotifications(),
      );

      expect(() => service.getBatchDuration('unknown')).toThrow(
        NotFoundException,
      );
    });

    it('should return positive duration for active batch', async () => {
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        createMockNotifications(),
      );
      const { batchId } = await service.enqueueBatch(defaultRequest, 'user-1');

      const duration = service.getBatchDuration(batchId);

      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should return fixed duration after batch completes', async () => {
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        createMockNotifications(),
      );
      const { batchId } = await service.enqueueBatch(
        { ...defaultRequest, count: 1 },
        'user-1',
      );

      await service.markItemCompleted(batchId, sampleDraft);
      const d1 = service.getBatchDuration(batchId);

      // Wait a bit and check it stays the same (endedAt was set)
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      const d2 = service.getBatchDuration(batchId);

      expect(d2).toBe(d1);
    });
  });

  describe('notifications', () => {
    it('should publish progress updates with correct room', async () => {
      const notifications = createMockNotifications();
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        notifications,
      );
      const { batchId } = await service.enqueueBatch(
        { ...defaultRequest, count: 2 },
        'user-42',
      );

      await service.markItemCompleted(batchId, sampleDraft);

      expect(notifications.publishBackgroundTaskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          label: expect.stringContaining('1/2'),
          progress: 50,
          room: 'user:user-42',
          status: 'completed',
        }),
      );
    });

    it('should report 100% progress when all items complete', async () => {
      const notifications = createMockNotifications();
      const service = new BatchContentQueueService(
        createMockQueue(),
        createMockLogger(),
        notifications,
      );
      const { batchId } = await service.enqueueBatch(
        { ...defaultRequest, count: 1 },
        'user-1',
      );

      await service.markItemCompleted(batchId, sampleDraft);

      expect(
        notifications.publishBackgroundTaskUpdate,
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({
          progress: 100,
        }),
      );
    });
  });
});
