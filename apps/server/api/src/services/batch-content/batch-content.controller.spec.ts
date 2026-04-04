import { BatchContentController } from '@api/services/batch-content/batch-content.controller';
import type { BatchContentService } from '@api/services/batch-content/batch-content.service';
import type { CreateBatchContentDto } from '@api/services/batch-content/dto/create-batch-content.dto';
import type { BatchStatus } from '@api/services/batch-content/interfaces/batch-content.interfaces';
import type { User } from '@clerk/backend';

function createMockUser(
  organization: string,
  userId: string,
  brand = 'brand-default',
): User {
  return {
    publicMetadata: {
      brand,
      organization,
      user: userId,
    },
  } as unknown as User;
}

function createMockBatchContentService(
  overrides: Partial<BatchContentService> = {},
): BatchContentService {
  return {
    generateBatch: vi.fn(),
    getBatchStatus: vi.fn().mockReturnValue({
      batchId: 'batch-1',
      brandId: 'brand-1',
      completed: 0,
      failed: 0,
      organizationId: 'org-1',
      results: [],
      status: 'queued',
      total: 3,
    } satisfies BatchStatus),
    rankDrafts: vi.fn(),
    triggerBatch: vi.fn().mockResolvedValue({ batchId: 'batch-1' }),
    ...overrides,
  } as unknown as BatchContentService;
}

describe('BatchContentController', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createBatch', () => {
    it('should trigger a batch and return queued response', async () => {
      const service = createMockBatchContentService();
      const controller = new BatchContentController(service);
      const dto: CreateBatchContentDto = {
        count: 2,
        params: { topic: 'launch' },
        skillSlug: 'content-writing',
      };
      const user = createMockUser('org-1', 'user-1');

      const result = await controller.createBatch('brand-1', dto, user);

      expect(service.triggerBatch).toHaveBeenCalledWith(
        {
          brandId: 'brand-1',
          count: 2,
          organizationId: 'org-1',
          params: { topic: 'launch' },
          skillSlug: 'content-writing',
        },
        'user-1',
      );
      expect(result).toEqual({ batchId: 'batch-1', status: 'queued' });
    });

    it('should pass skillSlug from dto to service', async () => {
      const service = createMockBatchContentService();
      const controller = new BatchContentController(service);
      const dto: CreateBatchContentDto = {
        count: 1,
        skillSlug: 'social-post',
      };
      const user = createMockUser('org-2', 'user-2');

      await controller.createBatch('brand-2', dto, user);

      expect(service.triggerBatch).toHaveBeenCalledWith(
        expect.objectContaining({ skillSlug: 'social-post' }),
        'user-2',
      );
    });

    it('should handle dto without optional params', async () => {
      const service = createMockBatchContentService();
      const controller = new BatchContentController(service);
      const dto: CreateBatchContentDto = {
        count: 5,
        skillSlug: 'content-writing',
      };
      const user = createMockUser('org-1', 'user-1');

      const result = await controller.createBatch('brand-1', dto, user);

      expect(service.triggerBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 5,
          params: undefined,
        }),
        'user-1',
      );
      expect(result.status).toBe('queued');
    });

    it('should propagate service errors', async () => {
      const service = createMockBatchContentService({
        triggerBatch: vi.fn().mockRejectedValue(new Error('Brand not found')),
      } as unknown as Partial<BatchContentService>);
      const controller = new BatchContentController(service);
      const dto: CreateBatchContentDto = {
        count: 1,
        skillSlug: 'content-writing',
      };
      const user = createMockUser('org-1', 'user-1');

      await expect(
        controller.createBatch('brand-1', dto, user),
      ).rejects.toThrow('Brand not found');
    });
  });

  describe('getBatchStatus', () => {
    it('should return batch status', () => {
      const expectedStatus: BatchStatus = {
        batchId: 'batch-42',
        brandId: 'brand-1',
        completed: 3,
        failed: 1,
        organizationId: 'org-1',
        results: [],
        status: 'completed',
        total: 4,
      };
      const service = createMockBatchContentService({
        getBatchStatus: vi.fn().mockReturnValue(expectedStatus),
      } as unknown as Partial<BatchContentService>);
      const controller = new BatchContentController(service);
      const user = createMockUser('org-1', 'user-1');

      const result = controller.getBatchStatus('brand-1', 'batch-42', user);

      expect(service.getBatchStatus).toHaveBeenCalledWith(
        'batch-42',
        'org-1',
        'brand-1',
      );
      expect(result).toEqual(expectedStatus);
    });

    it('should pass correct brandId from route param', () => {
      const service = createMockBatchContentService();
      const controller = new BatchContentController(service);
      const user = createMockUser('org-1', 'user-1');

      controller.getBatchStatus('brand-xyz', 'batch-1', user);

      expect(service.getBatchStatus).toHaveBeenCalledWith(
        'batch-1',
        'org-1',
        'brand-xyz',
      );
    });

    it('should extract organization from user publicMetadata', () => {
      const service = createMockBatchContentService();
      const controller = new BatchContentController(service);
      const user = createMockUser('my-org-id', 'user-1');

      controller.getBatchStatus('brand-1', 'batch-1', user);

      expect(service.getBatchStatus).toHaveBeenCalledWith(
        'batch-1',
        'my-org-id',
        'brand-1',
      );
    });

    it('should propagate NotFoundException from service', () => {
      const service = createMockBatchContentService({
        getBatchStatus: vi.fn().mockImplementation(() => {
          throw new Error('Batch not found');
        }),
      } as unknown as Partial<BatchContentService>);
      const controller = new BatchContentController(service);
      const user = createMockUser('org-1', 'user-1');

      expect(() =>
        controller.getBatchStatus('brand-1', 'batch-999', user),
      ).toThrow('Batch not found');
    });
  });
});
