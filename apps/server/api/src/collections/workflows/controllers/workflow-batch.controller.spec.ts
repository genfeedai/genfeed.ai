import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { WorkflowBatchController } from '@api/collections/workflows/controllers/workflow-batch.controller';
import { BatchWorkflowService } from '@api/collections/workflows/services/batch-workflow.service';
import { BatchWorkflowQueueService } from '@api/collections/workflows/services/batch-workflow-queue.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('WorkflowBatchController', () => {
  let controller: WorkflowBatchController;

  const mockUser: User = {
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
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
        id: '507f1f77bcf86cd799439099',
        completedCount: 1,
        createdAt: new Date('2026-03-15T12:00:00.000Z'),
        failedCount: 0,
        items: [
          {
            id: '507f1f77bcf86cd799439091',
            completedAt: new Date('2026-03-15T12:01:00.000Z'),
            executionId: 'exec-1',
            ingredientId: '507f1f77bcf86cd799439092',
            outputCategory: 'video',
            outputIngredientId: '507f1f77bcf86cd799439093',
            outputSummary: {
              category: 'video',
              id: '507f1f77bcf86cd799439093',
              ingredientUrl:
                'https://cdn.example.com/videos/507f1f77bcf86cd799439093',
              status: 'generated',
              thumbnailUrl:
                'https://cdn.example.com/thumbnails/507f1f77bcf86cd799439093.jpg',
            },
            startedAt: new Date('2026-03-15T12:00:30.000Z'),
            status: 'completed',
          },
        ],
        status: 'completed',
        totalCount: 1,
        updatedAt: new Date('2026-03-15T12:01:00.000Z'),
        workflowId: '507f1f77bcf86cd799439094',
      });

      const result = await controller.getBatchStatus(
        '507f1f77bcf86cd799439099',
        mockUser,
      );

      expect(mockBatchWorkflowService.getBatchJobForOrg).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439099',
        mockUser.publicMetadata.organization,
      );
      expect(result.data.items[0]).toMatchObject({
        executionId: 'exec-1',
        outputCategory: 'video',
        outputIngredientId: '507f1f77bcf86cd799439093',
        outputSummary: {
          category: 'video',
          id: '507f1f77bcf86cd799439093',
          ingredientUrl:
            'https://cdn.example.com/videos/507f1f77bcf86cd799439093',
          status: 'generated',
          thumbnailUrl:
            'https://cdn.example.com/thumbnails/507f1f77bcf86cd799439093.jpg',
        },
      });
    });
  });

  describe('listBatchJobs', () => {
    it('should list batch jobs scoped to the current organization', async () => {
      mockBatchWorkflowService.listBatchJobs.mockResolvedValue([
        {
          id: '507f1f77bcf86cd799439095',
          completedCount: 2,
          createdAt: new Date('2026-03-15T12:00:00.000Z'),
          failedCount: 1,
          status: 'completed',
          totalCount: 3,
          workflowId: '507f1f77bcf86cd799439096',
        },
      ]);

      const result = await controller.listBatchJobs(mockUser, '10', '5');

      expect(mockBatchWorkflowService.listBatchJobs).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        10,
        5,
      );
      expect(result.data).toEqual([
        {
          _id: '507f1f77bcf86cd799439095',
          completedCount: 2,
          createdAt: '2026-03-15T12:00:00.000Z',
          failedCount: 1,
          status: 'completed',
          totalCount: 3,
          workflowId: '507f1f77bcf86cd799439096',
        },
      ]);
    });
  });
});
