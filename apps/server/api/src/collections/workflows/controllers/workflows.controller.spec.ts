import { WorkflowsController } from '@api/collections/workflows/controllers/workflows.controller';
import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { UpdateWorkflowDto } from '@api/collections/workflows/dto/update-workflow.dto';
import { BatchWorkflowService } from '@api/collections/workflows/services/batch-workflow.service';
import { BatchWorkflowQueueService } from '@api/collections/workflows/services/batch-workflow-queue.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowFormatConverterService } from '@api/collections/workflows/services/workflow-format-converter.service';
import { WorkflowGenerationService } from '@api/collections/workflows/services/workflow-generation.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import type { User } from '@clerk/backend';
import { WorkflowStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('WorkflowsController', () => {
  let controller: WorkflowsController;
  let service: WorkflowsService;

  const mockRequest = {} as Request;

  const mockUser: User = {
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockWorkflow = {
    _id: '507f1f77bcf86cd799439014',
    createdAt: new Date(),
    description: 'Automated content workflow',
    isDeleted: false,
    label: 'Test Workflow',
    organization: '507f1f77bcf86cd799439012',
    status: WorkflowStatus.DRAFT,
    steps: [],
    updatedAt: new Date(),
    user: '507f1f77bcf86cd799439011',
  };

  const mockWorkflowsService = {
    cloneWorkflow: vi.fn(),
    createWorkflow: vi.fn(),
    executePartial: vi.fn(),
    executeWorkflow: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    getWorkflowStatistics: vi.fn(),
    getWorkflowTemplates: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
    resumeFromFailed: vi.fn(),
    setThumbnail: vi.fn(),
  };

  const mockWorkflowExecutorService = {
    submitReviewGateApproval: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockBatchWorkflowService = {
    createBatchJob: vi.fn(),
    getBatchJobForOrg: vi.fn(),
    listBatchJobs: vi.fn(),
    markProcessing: vi.fn(),
  };

  const mockBatchWorkflowQueueService = {
    enqueueBatchItems: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowsController],
      providers: [
        {
          provide: WorkflowsService,
          useValue: mockWorkflowsService,
        },
        {
          provide: WorkflowSchedulerService,
          useValue: {},
        },
        {
          provide: WorkflowExecutorService,
          useValue: mockWorkflowExecutorService,
        },
        {
          provide: MarketplaceApiClient,
          useValue: {},
        },
        {
          provide: WorkflowGenerationService,
          useValue: {},
        },
        {
          provide: WorkflowFormatConverterService,
          useValue: {},
        },
        {
          provide: BatchWorkflowService,
          useValue: mockBatchWorkflowService,
        },
        {
          provide: BatchWorkflowQueueService,
          useValue: mockBatchWorkflowQueueService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkflowsController>(WorkflowsController);
    service = module.get<WorkflowsService>(WorkflowsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getTemplates', () => {
    it('should return workflow templates', async () => {
      const templates = [
        { name: 'Social Media Automation', steps: [] },
        { name: 'Content Publishing', steps: [] },
      ];

      mockWorkflowsService.getWorkflowTemplates.mockResolvedValue(templates);

      const result = await controller.getTemplates();

      expect(service.getWorkflowTemplates).toHaveBeenCalled();
      expect(result.data).toEqual(templates);
    });
  });

  describe('create', () => {
    it('should create a workflow', async () => {
      const createDto: CreateWorkflowDto = {
        description: 'Automated workflow',
        label: 'Test Workflow',
        steps: [],
      };

      mockWorkflowsService.createWorkflow.mockResolvedValue(mockWorkflow);

      const result = await controller.create(mockRequest, createDto, mockUser);

      expect(service.createWorkflow).toHaveBeenCalledWith(
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
        createDto,
      );
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should return all workflows for user', async () => {
      const workflows = [mockWorkflow];

      mockWorkflowsService.findAll.mockResolvedValue({
        docs: workflows,
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });

      const result = await controller.findAll(mockRequest, mockUser, {});

      expect(service.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('getStatistics', () => {
    it('should return workflow statistics', async () => {
      const stats = {
        active: 5,
        completed: 2,
        draft: 3,
        total: 10,
      };

      mockWorkflowsService.getWorkflowStatistics.mockResolvedValue(stats);

      const result = await controller.getStatistics(mockUser);

      expect(service.getWorkflowStatistics).toHaveBeenCalledWith(
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
      );
      expect(result.data).toEqual(stats);
    });
  });

  describe('findOne', () => {
    it('should return a workflow by id', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockWorkflowsService.findOne.mockResolvedValue(mockWorkflow);

      const result = await controller.findOne(mockRequest, id, mockUser);

      expect(service.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('setThumbnail', () => {
    it('should persist the workflow thumbnail for the current user org', async () => {
      mockWorkflowsService.setThumbnail.mockResolvedValue({
        ...mockWorkflow,
        thumbnail: 'https://cdn.example.com/thumb.jpg',
        thumbnailNodeId: 'node-output-1',
      });

      const result = await controller.setThumbnail(
        mockRequest,
        '507f1f77bcf86cd799439014',
        {
          nodeId: 'node-output-1',
          thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
        },
        mockUser,
      );

      expect(service.setThumbnail).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439014',
        'https://cdn.example.com/thumb.jpg',
        'node-output-1',
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
      );
      expect(result).toBeDefined();
    });
  });

  describe('submitApproval', () => {
    it('should submit a review gate approval for the current org', async () => {
      mockWorkflowExecutorService.submitReviewGateApproval.mockResolvedValue({
        approvedAt: '2026-01-01T00:00:00.000Z',
        approvedBy: mockUser.publicMetadata.user,
        executionId: 'exec-1',
        nodeId: 'review-gate-1',
        status: 'approved',
      });

      const result = await controller.submitApproval(
        '507f1f77bcf86cd799439014',
        'exec-1',
        {
          approved: true,
          nodeId: 'review-gate-1',
        },
        mockUser,
      );

      expect(
        mockWorkflowExecutorService.submitReviewGateApproval,
      ).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439014',
        'exec-1',
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
        'review-gate-1',
        true,
        undefined,
      );
      expect(result).toEqual({
        data: {
          approvedAt: '2026-01-01T00:00:00.000Z',
          approvedBy: mockUser.publicMetadata.user,
          executionId: 'exec-1',
          nodeId: 'review-gate-1',
          status: 'approved',
        },
      });
    });
  });

  describe('cloneWorkflow', () => {
    it('should clone a workflow', async () => {
      const id = '507f1f77bcf86cd799439014';
      const clonedWorkflow = {
        ...mockWorkflow,
        _id: '507f1f77bcf86cd799439015',
        label: 'Test Workflow (Copy)',
      };

      mockWorkflowsService.cloneWorkflow.mockResolvedValue(clonedWorkflow);

      const result = await controller.cloneWorkflow(mockRequest, id, mockUser);

      expect(service.cloneWorkflow).toHaveBeenCalledWith(
        id,
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
      );
      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update a workflow', async () => {
      const id = '507f1f77bcf86cd799439014';
      const updateDto: UpdateWorkflowDto = {
        label: 'Updated Workflow',
      };

      mockWorkflowsService.findOne.mockResolvedValue(mockWorkflow);
      const updatedWorkflow = { ...mockWorkflow, ...updateDto };
      mockWorkflowsService.patch.mockResolvedValue(updatedWorkflow);

      const result = await controller.update(
        mockRequest,
        id,
        updateDto,
        mockUser,
      );

      expect(service.patch).toHaveBeenCalledWith(id, updateDto);
      expect(result).toBeDefined();
    });
  });

  describe('remove', () => {
    it('should remove a workflow', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockWorkflowsService.findOne.mockResolvedValue(mockWorkflow);
      mockWorkflowsService.remove.mockResolvedValue(mockWorkflow);

      const result = await controller.remove(mockRequest, id, mockUser);

      expect(service.remove).toHaveBeenCalledWith(id);
      expect(result).toBeDefined();
    });
  });

  describe('getBatchStatus', () => {
    it('should return batch status scoped to the current organization with additive output metadata', async () => {
      mockBatchWorkflowService.getBatchJobForOrg.mockResolvedValue({
        _id: '507f1f77bcf86cd799439099',
        completedCount: 1,
        createdAt: new Date('2026-03-15T12:00:00.000Z'),
        failedCount: 0,
        items: [
          {
            _id: '507f1f77bcf86cd799439091',
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
          _id: '507f1f77bcf86cd799439095',
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
