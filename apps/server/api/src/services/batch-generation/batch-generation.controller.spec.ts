import { MembersService } from '@api/collections/members/services/members.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { BatchGenerationController } from '@api/services/batch-generation/batch-generation.controller';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    organization: new Types.ObjectId().toString(),
    user: new Types.ObjectId().toString(),
  })),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_, __, { docs }) => docs),
  serializeSingle: vi.fn((_, __, data) => data),
}));

describe('BatchGenerationController', () => {
  let controller: BatchGenerationController;
  let service: vi.Mocked<BatchGenerationService>;

  const mockReq = {} as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BatchGenerationController],
      providers: [
        {
          provide: MembersService,
          useValue: { find: vi.fn().mockResolvedValue([]), findOne: vi.fn() },
        },
        {
          provide: BatchGenerationService,
          useValue: {
            approveItems: vi.fn(),
            cancelBatch: vi.fn(),
            createBatch: vi.fn(),
            createManualReviewBatch: vi.fn(),
            getBatch: vi.fn(),
            getBatches: vi.fn(),
            processBatch: vi.fn(),
            rejectItems: vi.fn(),
            requestChanges: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BatchGenerationController>(
      BatchGenerationController,
    );
    service = module.get(BatchGenerationService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createBatch', () => {
    it('should call service.createBatch', () => {
      const user = {
        id: 'user-123',
        publicMetadata: { organization: 'org', user: 'usr' },
      } as never;
      controller.createBatch(
        mockReq,
        { brandId: 'brand-1', count: 10 } as never,
        user,
      );
      expect(service.createBatch).toHaveBeenCalled();
    });
  });

  describe('createManualReviewBatch', () => {
    it('should call service.createManualReviewBatch', async () => {
      service.createManualReviewBatch.mockResolvedValue({
        id: 'batch-1',
        items: [],
      } as never);

      const user = {
        id: 'user-123',
        publicMetadata: { organization: 'org', user: 'usr' },
      } as never;

      const result = await controller.createManualReviewBatch(
        mockReq,
        {
          brandId: new Types.ObjectId().toString(),
          items: [{ format: 'video' }],
        } as never,
        user,
      );

      expect(service.createManualReviewBatch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('getBatches', () => {
    it('should call service.getBatches', async () => {
      service.getBatches.mockResolvedValue({ items: [], total: 0 } as never);
      const user = {
        id: 'user-123',
        publicMetadata: { organization: 'org', user: 'usr' },
      } as never;
      const result = await controller.getBatches(mockReq, {} as never, user);
      expect(service.getBatches).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('getBatch', () => {
    it('should call service.getBatch with batchId', async () => {
      const batchDoc = { _id: 'batch-1', status: 'completed' };
      service.getBatch.mockResolvedValue(batchDoc as never);
      const user = {
        id: 'user-123',
        publicMetadata: { organization: 'org', user: 'usr' },
      } as never;
      const result = await controller.getBatch(mockReq, 'batch-1', user);
      expect(service.getBatch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('processBatch', () => {
    it('should delegate to service to start processing', async () => {
      const user = {
        id: 'user-123',
        publicMetadata: { organization: 'org', user: 'usr' },
      } as never;
      (service as Record<string, ReturnType<typeof vi.fn>>).processBatch = vi
        .fn()
        .mockResolvedValue({ status: 'processing' });

      const result = await controller.processBatch(mockReq, 'batch-1', user);
      expect(result).toBeDefined();
    });
  });

  describe('cancelBatch', () => {
    it('should delegate to service to cancel batch', async () => {
      const user = {
        id: 'user-123',
        publicMetadata: { organization: 'org', user: 'usr' },
      } as never;
      (service as Record<string, ReturnType<typeof vi.fn>>).cancelBatch = vi
        .fn()
        .mockResolvedValue({ status: 'cancelled' });

      const result = await controller.cancelBatch(mockReq, 'batch-1', user);
      expect(result).toBeDefined();
    });
  });

  describe('itemAction', () => {
    it('routes request_changes actions to the requestChanges service method', async () => {
      service.requestChanges.mockResolvedValue({ id: 'batch-1' } as never);

      const user = {
        id: 'user-123',
        publicMetadata: { organization: 'org', user: 'usr' },
      } as never;

      await controller.itemAction(
        mockReq,
        'batch-1',
        {
          action: 'request_changes',
          feedback: 'Tighten the hook and shorten the caption.',
          itemIds: ['item-1'],
        } as never,
        user,
      );

      expect(service.requestChanges).toHaveBeenCalledWith(
        'batch-1',
        ['item-1'],
        expect.any(String),
        'Tighten the hook and shorten the caption.',
      );
    });
  });
});
