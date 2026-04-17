import {
  BatchWorkflowItemStatus,
  BatchWorkflowJob,
  BatchWorkflowJobStatus,
} from '@api/collections/workflows/schemas/batch-workflow-job.schema';
import { BatchWorkflowService } from '@api/collections/workflows/services/batch-workflow.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

// =============================================================================
// MOCKS
// =============================================================================

const mockBatchJobDoc = (overrides = {}) => {
  const id = 'test-object-id';
  return {
    _id: id,
    completedCount: 0,
    createdAt: new Date(),
    failedCount: 0,
    items: [
      {
        _id: 'test-object-id',
        ingredientId: 'test-object-id',
        status: BatchWorkflowItemStatus.PENDING,
      },
      {
        _id: 'test-object-id',
        ingredientId: 'test-object-id',
        status: BatchWorkflowItemStatus.PENDING,
      },
    ],
    organization: 'test-object-id',
    status: BatchWorkflowJobStatus.PENDING,
    totalCount: 2,
    updatedAt: new Date(),
    user: 'test-object-id',
    workflowId: 'test-object-id',
    ...overrides,
  };
};

const mockModel = {
  create: vi.fn(),
  find: vi.fn(),
  findById: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
};

const mockLogger = {
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

// =============================================================================
// TESTS
// =============================================================================

describe('BatchWorkflowService', () => {
  let service: BatchWorkflowService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchWorkflowService,
        { provide: PrismaService, useValue: mockModel },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<BatchWorkflowService>(BatchWorkflowService);
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. BatchWorkflowJob creates correctly
  // ---------------------------------------------------------------------------
  it('should create a batch job with correct item count', async () => {
    const ingredientIds = [
      'test-object-id'.toString(),
      'test-object-id'.toString(),
      'test-object-id'.toString(),
    ];
    const doc = mockBatchJobDoc({ totalCount: 3 });
    mockModel.create.mockResolvedValue(doc);

    const result = await service.createBatchJob({
      ingredientIds,
      organizationId: 'test-object-id'.toString(),
      userId: 'test-object-id'.toString(),
      workflowId: 'test-object-id'.toString(),
    });

    expect(mockModel.create).toHaveBeenCalledTimes(1);
    const createArg = mockModel.create.mock.calls[0][0];
    expect(createArg.items).toHaveLength(3);
    expect(createArg.totalCount).toBe(3);
    expect(createArg.status).toBe(BatchWorkflowJobStatus.PENDING);
    expect(result).toBe(doc);
  });

  // ---------------------------------------------------------------------------
  // 2. Batch endpoint validates ingredientIds
  // ---------------------------------------------------------------------------
  it('should throw BadRequestException for empty ingredientIds', async () => {
    await expect(
      service.createBatchJob({
        ingredientIds: [],
        organizationId: 'test-object-id'.toString(),
        userId: 'test-object-id'.toString(),
        workflowId: 'test-object-id'.toString(),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when exceeding 100 items', async () => {
    const ids = Array.from({ length: 101 }, () => 'test-object-id'.toString());
    await expect(
      service.createBatchJob({
        ingredientIds: ids,
        organizationId: 'test-object-id'.toString(),
        userId: 'test-object-id'.toString(),
        workflowId: 'test-object-id'.toString(),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ---------------------------------------------------------------------------
  // 3. markItemCompleted updates correctly
  // ---------------------------------------------------------------------------
  it('should mark an item as completed and check finalization', async () => {
    const batchJobId = 'test-object-id'.toString();
    const itemId = 'test-object-id'.toString();

    mockModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    // For checkAndFinalizeJob
    mockModel.findById.mockReturnValue({
      exec: vi.fn().mockResolvedValue(
        mockBatchJobDoc({
          completedCount: 1,
          failedCount: 0,
          totalCount: 2,
        }),
      ),
    });

    await service.markItemCompleted(batchJobId, itemId, {
      executionId: 'exec-123',
      outputCategory: 'video',
      outputIngredientId: 'test-object-id'.toString(),
      outputSummary: {
        category: 'video',
        id: 'summary-123',
        ingredientUrl: 'https://cdn.example.com/videos/summary-123',
        status: 'generated',
        thumbnailUrl: 'https://cdn.example.com/thumbnails/summary-123.jpg',
      },
    });

    expect(mockModel.updateOne).toHaveBeenCalledTimes(1);
    const updateCall = mockModel.updateOne.mock.calls[0];
    expect(updateCall[1].$set['items.$.status']).toBe(
      BatchWorkflowItemStatus.COMPLETED,
    );
    expect(updateCall[1].$set['items.$.executionId']).toBe('exec-123');
    expect(updateCall[1].$set['items.$.outputCategory']).toBe('video');
    expect(updateCall[1].$set['items.$.outputSummary']).toEqual({
      category: 'video',
      id: 'summary-123',
      ingredientUrl: 'https://cdn.example.com/videos/summary-123',
      status: 'generated',
      thumbnailUrl: 'https://cdn.example.com/thumbnails/summary-123.jpg',
    });
    expect(updateCall[1].$inc.completedCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 4. markItemFailed handles failure without failing whole batch
  // ---------------------------------------------------------------------------
  it('should mark item as failed and not fail the whole batch when other items remain', async () => {
    const batchJobId = 'test-object-id'.toString();
    const itemId = 'test-object-id'.toString();

    mockModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    // After failure, 1 failed + 0 completed < 2 total, so no finalization
    mockModel.findById.mockReturnValue({
      exec: vi.fn().mockResolvedValue(
        mockBatchJobDoc({
          completedCount: 0,
          failedCount: 1,
          totalCount: 2,
        }),
      ),
    });

    await service.markItemFailed(batchJobId, itemId, 'Some error');

    const updateCall = mockModel.updateOne.mock.calls[0];
    expect(updateCall[1].$set['items.$.status']).toBe(
      BatchWorkflowItemStatus.FAILED,
    );
    expect(updateCall[1].$set['items.$.error']).toBe('Some error');
    // Only 1 update call (not 2) because finalization is skipped
    expect(mockModel.updateOne).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // 5. Status endpoint returns correct aggregate (getBatchJob)
  // ---------------------------------------------------------------------------
  it('should return batch job by id', async () => {
    const doc = mockBatchJobDoc();
    mockModel.findById.mockReturnValue({
      exec: vi.fn().mockResolvedValue(doc),
    });

    const result = await service.getBatchJob(doc._id.toString());
    expect(result).toBe(doc);
  });

  it('should throw NotFoundException when batch job not found', async () => {
    mockModel.findById.mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
    });

    await expect(
      service.getBatchJob('test-object-id'.toString()),
    ).rejects.toThrow(NotFoundException);
  });

  // ---------------------------------------------------------------------------
  // 6. Finalization marks batch as completed when all items done
  // ---------------------------------------------------------------------------
  it('should finalize batch as completed when all items are done', async () => {
    const batchJobId = 'test-object-id'.toString();
    const itemId = 'test-object-id'.toString();

    mockModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    // After this completion: 2 completed + 0 failed = 2 total → finalize
    mockModel.findById.mockReturnValue({
      exec: vi.fn().mockResolvedValue(
        mockBatchJobDoc({
          completedCount: 2,
          failedCount: 0,
          totalCount: 2,
        }),
      ),
    });

    await service.markItemCompleted(batchJobId, itemId);

    // 2 updateOne calls: one for item, one for finalization
    expect(mockModel.updateOne).toHaveBeenCalledTimes(2);
    const finalizeCall = mockModel.updateOne.mock.calls[1];
    expect(finalizeCall[1].$set.status).toBe(BatchWorkflowJobStatus.COMPLETED);
  });
});
