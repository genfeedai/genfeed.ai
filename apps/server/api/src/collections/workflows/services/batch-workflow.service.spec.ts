import {
  BatchWorkflowItemStatus,
  BatchWorkflowJob,
  BatchWorkflowJobStatus,
} from '@api/collections/workflows/schemas/batch-workflow-job.schema';
import { BatchWorkflowService } from '@api/collections/workflows/services/batch-workflow.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

// =============================================================================
// MOCKS
// =============================================================================

const mockBatchJobDoc = (overrides = {}) => {
  const id = new Types.ObjectId();
  return {
    _id: id,
    completedCount: 0,
    createdAt: new Date(),
    failedCount: 0,
    items: [
      {
        _id: new Types.ObjectId(),
        ingredientId: new Types.ObjectId(),
        status: BatchWorkflowItemStatus.PENDING,
      },
      {
        _id: new Types.ObjectId(),
        ingredientId: new Types.ObjectId(),
        status: BatchWorkflowItemStatus.PENDING,
      },
    ],
    organization: new Types.ObjectId(),
    status: BatchWorkflowJobStatus.PENDING,
    totalCount: 2,
    updatedAt: new Date(),
    user: new Types.ObjectId(),
    workflowId: new Types.ObjectId(),
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
        {
          provide: getModelToken(BatchWorkflowJob.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
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
      new Types.ObjectId().toString(),
      new Types.ObjectId().toString(),
      new Types.ObjectId().toString(),
    ];
    const doc = mockBatchJobDoc({ totalCount: 3 });
    mockModel.create.mockResolvedValue(doc);

    const result = await service.createBatchJob({
      ingredientIds,
      organizationId: new Types.ObjectId().toString(),
      userId: new Types.ObjectId().toString(),
      workflowId: new Types.ObjectId().toString(),
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
        organizationId: new Types.ObjectId().toString(),
        userId: new Types.ObjectId().toString(),
        workflowId: new Types.ObjectId().toString(),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when exceeding 100 items', async () => {
    const ids = Array.from({ length: 101 }, () =>
      new Types.ObjectId().toString(),
    );
    await expect(
      service.createBatchJob({
        ingredientIds: ids,
        organizationId: new Types.ObjectId().toString(),
        userId: new Types.ObjectId().toString(),
        workflowId: new Types.ObjectId().toString(),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ---------------------------------------------------------------------------
  // 3. markItemCompleted updates correctly
  // ---------------------------------------------------------------------------
  it('should mark an item as completed and check finalization', async () => {
    const batchJobId = new Types.ObjectId().toString();
    const itemId = new Types.ObjectId().toString();

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
      outputIngredientId: new Types.ObjectId().toString(),
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
    const batchJobId = new Types.ObjectId().toString();
    const itemId = new Types.ObjectId().toString();

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
      service.getBatchJob(new Types.ObjectId().toString()),
    ).rejects.toThrow(NotFoundException);
  });

  // ---------------------------------------------------------------------------
  // 6. Finalization marks batch as completed when all items done
  // ---------------------------------------------------------------------------
  it('should finalize batch as completed when all items are done', async () => {
    const batchJobId = new Types.ObjectId().toString();
    const itemId = new Types.ObjectId().toString();

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
