import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { WorkflowBatchController } from '@api/collections/workflows/controllers/workflow-batch.controller';
import { BatchWorkflowService } from '@api/collections/workflows/services/batch-workflow.service';
import { BatchWorkflowQueueService } from '@api/collections/workflows/services/batch-workflow-queue.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('WorkflowBatchController', () => {
  const organizationId = '550e8400-e29b-41d4-a716-446655440001';
  const userId = '550e8400-e29b-41d4-a716-446655440002';
  const batchId = '550e8400-e29b-41d4-a716-446655440003';
  const batchItemId = '550e8400-e29b-41d4-a716-446655440004';
  const ingredientId = '550e8400-e29b-41d4-a716-446655440005';
  const outputIngredientId = '550e8400-e29b-41d4-a716-446655440006';
  const workflowId = '550e8400-e29b-41d4-a716-446655440007';
  const listedBatchId = '550e8400-e29b-41d4-a716-446655440008';
  const listedWorkflowId = '550e8400-e29b-41d4-a716-446655440009';
  let controller: WorkflowBatchController;

  const mockUser: User = {
    organizationId: organizationId,
    userId: userId,
  } as unknown as User;

  const mockBatchWorkflowService = {
    createBatchJob: vi.fn(),
    getBatchJobForOrg: vi.fn(),
    listBatchJobs: vi.fn(),
    markProcessing: vi.fn(),
  };

  const mockBatchWorkflowQueueService = {
    enqueueBatchItems: vi.fn(),
  };

  const mockWorkflowsService = {
    findOwnedOrThrow: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowBatchController],
      providers: [
        { provide: WorkflowsService, useValue: mockWorkflowsService },
        { provide: BatchWorkflowService, useValue: mockBatchWorkflowService },
        {
          provide: BatchWorkflowQueueService,
          useValue: mockBatchWorkflowQueueService,
        },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkflowBatchController>(WorkflowBatchController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getBatchStatus', () => {
    it('should return batch status scoped to the current organization with additive output metadata', async () => {
      mockBatchWorkflowService.getBatchJobForOrg.mockResolvedValue({
        id: batchId,
        completedCount: 1,
        createdAt: new Date('2026-03-15T12:00:00.000Z'),
        failedCount: 0,
        items: [
          {
            id: batchItemId,
            completedAt: new Date('2026-03-15T12:01:00.000Z'),
            executionId: 'exec-1',
            ingredientId,
            outputCategory: 'video',
            outputIngredientId,
            outputSummary: {
              category: 'video',
              id: outputIngredientId,
              ingredientUrl: `https://cdn.example.com/videos/${outputIngredientId}`,
              status: 'generated',
              thumbnailUrl: `https://cdn.example.com/thumbnails/${outputIngredientId}.jpg`,
            },
            startedAt: new Date('2026-03-15T12:00:30.000Z'),
            status: 'completed',
          },
        ],
        status: 'completed',
        totalCount: 1,
        updatedAt: new Date('2026-03-15T12:01:00.000Z'),
        workflowId,
      });

      const result = await controller.getBatchStatus(batchId, mockUser);

      expect(mockBatchWorkflowService.getBatchJobForOrg).toHaveBeenCalledWith(
        batchId,
        mockUser.organizationId,
      );
      expect(result.data.items[0]).toMatchObject({
        executionId: 'exec-1',
        outputCategory: 'video',
        outputIngredientId,
        outputSummary: {
          category: 'video',
          id: outputIngredientId,
          ingredientUrl: `https://cdn.example.com/videos/${outputIngredientId}`,
          status: 'generated',
          thumbnailUrl: `https://cdn.example.com/thumbnails/${outputIngredientId}.jpg`,
        },
      });
    });
  });

  describe('listBatchJobs', () => {
    it('should list batch jobs scoped to the current organization', async () => {
      mockBatchWorkflowService.listBatchJobs.mockResolvedValue([
        {
          id: listedBatchId,
          completedCount: 2,
          createdAt: new Date('2026-03-15T12:00:00.000Z'),
          failedCount: 1,
          status: 'completed',
          totalCount: 3,
          workflowId: listedWorkflowId,
        },
      ]);

      const result = await controller.listBatchJobs(mockUser, '10', '5');

      expect(mockBatchWorkflowService.listBatchJobs).toHaveBeenCalledWith(
        mockUser.organizationId,
        10,
        5,
      );
      expect(result.data).toEqual([
        {
          id: listedBatchId,
          completedCount: 2,
          createdAt: '2026-03-15T12:00:00.000Z',
          failedCount: 1,
          status: 'completed',
          totalCount: 3,
          workflowId: listedWorkflowId,
        },
      ]);
    });
  });
});
