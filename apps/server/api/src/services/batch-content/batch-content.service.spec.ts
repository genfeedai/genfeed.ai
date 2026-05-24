import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { BatchContentService } from '@api/services/batch-content/batch-content.service';
import type { BatchContentQueueService } from '@api/services/batch-content/batch-content-queue.service';
import type {
  BatchContentRequest,
  BatchStatus,
} from '@api/services/batch-content/interfaces/batch-content.interfaces';
import type { ContentDraft } from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function createMockQueueService(
  overrides: Partial<BatchContentQueueService> = {},
): BatchContentQueueService {
  return {
    enqueueBatch: vi
      .fn()
      .mockResolvedValue({ batchId: 'batch-1', jobIds: ['j1'] }),
    getBatchDuration: vi.fn().mockReturnValue(500),
    getBatchStatus: vi.fn().mockReturnValue({
      batchId: 'batch-1',
      brandId: 'brand-1',
      completed: 2,
      failed: 0,
      organizationId: 'org-1',
      results: [],
      status: 'completed',
      total: 2,
    } satisfies BatchStatus),
    markItemCompleted: vi.fn(),
    markItemFailed: vi.fn(),
    markItemProcessing: vi.fn(),
    ...overrides,
  } as unknown as BatchContentQueueService;
}

function createMockBrandsService(
  overrides: Partial<BrandsService> = {},
): BrandsService {
  const orgId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  return {
    findOne: vi.fn().mockResolvedValue({
      _id: 'test-object-id',
      organization: orgId,
    }),
    ...overrides,
  } as unknown as BrandsService;
}

const defaultRequest: BatchContentRequest = {
  brandId: 'aaaaaaaaaaaaaaaaaaaaaaab',
  count: 3,
  organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  params: { topic: 'test' },
  skillSlug: 'content-writing',
};

describe('BatchContentService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('triggerBatch', () => {
    it('should validate brand ownership and enqueue batch', async () => {
      const orgId = defaultRequest.organizationId;
      const brandsService = createMockBrandsService({
        findOne: vi.fn().mockResolvedValue({
          _id: defaultRequest.brandId,
          organization: orgId,
        }),
      } as unknown as Partial<BrandsService>);
      const queueService = createMockQueueService();
      const service = new BatchContentService(
        queueService,
        brandsService,
        createMockLogger(),
      );

      const result = await service.triggerBatch(defaultRequest, 'user-1');

      expect(brandsService.findOne).toHaveBeenCalled();
      expect(queueService.enqueueBatch).toHaveBeenCalledWith(
        defaultRequest,
        'user-1',
      );
      expect(result).toEqual({ batchId: 'batch-1' });
    });

    it('should throw NotFoundException when brand not found', async () => {
      const brandsService = createMockBrandsService({
        findOne: vi.fn().mockResolvedValue(null),
      } as unknown as Partial<BrandsService>);
      const service = new BatchContentService(
        createMockQueueService(),
        brandsService,
        createMockLogger(),
      );

      await expect(
        service.triggerBatch(defaultRequest, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when brand belongs to different org', async () => {
      const differentOrgId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
      const brandsService = createMockBrandsService({
        findOne: vi.fn().mockResolvedValue({
          _id: defaultRequest.brandId,
          organization: differentOrgId,
        }),
      } as unknown as Partial<BrandsService>);
      const service = new BatchContentService(
        createMockQueueService(),
        brandsService,
        createMockLogger(),
      );

      await expect(
        service.triggerBatch(defaultRequest, 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getBatchStatus', () => {
    it('should return status from queue service for processing batch', () => {
      const processingStatus: BatchStatus = {
        batchId: 'batch-1',
        brandId: 'brand-1',
        completed: 1,
        failed: 0,
        organizationId: 'org-1',
        results: [],
        status: 'processing',
        total: 3,
      };
      const queueService = createMockQueueService({
        getBatchStatus: vi.fn().mockReturnValue(processingStatus),
      } as unknown as Partial<BatchContentQueueService>);
      const service = new BatchContentService(
        queueService,
        createMockBrandsService(),
        createMockLogger(),
      );

      const result = service.getBatchStatus('batch-1', 'org-1', 'brand-1');

      expect(result.status).toBe('processing');
      expect(result.completed).toBe(1);
    });

    it('should rank results when status is completed', () => {
      const completedStatus: BatchStatus = {
        batchId: 'batch-1',
        brandId: 'brand-1',
        completed: 2,
        failed: 0,
        organizationId: 'org-1',
        results: [
          {
            confidence: 0.2,
            content: 'low quality',
            metadata: {},
            platforms: [],
            skillSlug: 'skill',
            type: 'text',
          },
          {
            confidence: 0.8,
            content: 'high quality',
            metadata: {},
            platforms: [],
            skillSlug: 'skill',
            type: 'text',
          },
        ] as ContentDraft[],
        status: 'completed',
        total: 2,
      };
      const queueService = createMockQueueService({
        getBatchStatus: vi.fn().mockReturnValue(completedStatus),
      } as unknown as Partial<BatchContentQueueService>);
      const service = new BatchContentService(
        queueService,
        createMockBrandsService(),
        createMockLogger(),
      );

      const result = service.getBatchStatus('batch-1', 'org-1', 'brand-1');

      expect(result.results[0].metadata?.rank).toBeDefined();
    });

    it('should not rank results when status is queued', () => {
      const queuedStatus: BatchStatus = {
        batchId: 'batch-1',
        brandId: 'brand-1',
        completed: 0,
        failed: 0,
        organizationId: 'org-1',
        results: [],
        status: 'queued',
        total: 3,
      };
      const queueService = createMockQueueService({
        getBatchStatus: vi.fn().mockReturnValue(queuedStatus),
      } as unknown as Partial<BatchContentQueueService>);
      const service = new BatchContentService(
        queueService,
        createMockBrandsService(),
        createMockLogger(),
      );

      const result = service.getBatchStatus('batch-1', 'org-1', 'brand-1');

      expect(result.results).toEqual([]);
      expect(result.status).toBe('queued');
    });
  });

  describe('rankDrafts', () => {
    it('should rank by confidence descending', () => {
      const service = new BatchContentService(
        createMockQueueService(),
        createMockBrandsService(),
        createMockLogger(),
      );

      const result = service.rankDrafts([
        { confidence: 0.5, content: 'mid', skillSlug: 'skill' },
        { confidence: 0.9, content: 'best', skillSlug: 'skill' },
        { confidence: 0.1, content: 'worst', skillSlug: 'skill' },
      ] as unknown as ContentDraft[]);

      expect(result[0].content).toBe('best');
      expect(result[1].content).toBe('mid');
      expect(result[2].content).toBe('worst');
    });

    it('should break ties by content length descending', () => {
      const service = new BatchContentService(
        createMockQueueService(),
        createMockBrandsService(),
        createMockLogger(),
      );

      const result = service.rankDrafts([
        { confidence: 0.9, content: 'short', skillSlug: 'skill' },
        {
          confidence: 0.9,
          content: 'this is a much longer piece of content',
          skillSlug: 'skill',
        },
      ] as unknown as ContentDraft[]);

      expect(result[0].content).toBe('this is a much longer piece of content');
      expect(result[0].metadata?.rank).toBe(1);
      expect(result[1].metadata?.rank).toBe(2);
    });

    it('should handle drafts with undefined confidence', () => {
      const service = new BatchContentService(
        createMockQueueService(),
        createMockBrandsService(),
        createMockLogger(),
      );

      const result = service.rankDrafts([
        { content: 'no score', skillSlug: 'skill' },
        { confidence: 0.5, content: 'has score', skillSlug: 'skill' },
      ] as unknown as ContentDraft[]);

      expect(result[0].content).toBe('has score');
      expect(result[1].content).toBe('no score');
    });

    it('should return empty array for empty input', () => {
      const service = new BatchContentService(
        createMockQueueService(),
        createMockBrandsService(),
        createMockLogger(),
      );

      const result = service.rankDrafts([]);

      expect(result).toEqual([]);
    });

    it('should preserve existing metadata and add rank', () => {
      const service = new BatchContentService(
        createMockQueueService(),
        createMockBrandsService(),
        createMockLogger(),
      );

      const result = service.rankDrafts([
        {
          confidence: 0.9,
          content: 'a',
          metadata: { source: 'test' },
          skillSlug: 'skill',
        },
      ] as unknown as ContentDraft[]);

      expect(result[0].metadata).toEqual({ rank: 1, source: 'test' });
    });
  });
});
