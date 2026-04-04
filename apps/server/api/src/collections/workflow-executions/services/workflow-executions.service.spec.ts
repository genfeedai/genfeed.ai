import { CreateWorkflowExecutionDto } from '@api/collections/workflow-executions/dto/create-workflow-execution.dto';
import {
  WorkflowExecution,
  WorkflowNodeResult,
} from '@api/collections/workflow-executions/schemas/workflow-execution.schema';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('WorkflowExecutionsService', () => {
  let service: WorkflowExecutionsService;
  let mockModel: Record<string, vi.Mock>;
  let mockLoggerService: Record<string, vi.Mock>;

  const mockUserId = new Types.ObjectId().toString();
  const mockOrgId = new Types.ObjectId().toString();
  const mockWorkflowId = new Types.ObjectId().toString();
  const mockExecutionId = new Types.ObjectId().toString();

  const createMockExecution = (overrides = {}) => ({
    _id: new Types.ObjectId(mockExecutionId),
    completedAt: null,
    durationMs: 0,
    inputValues: {},
    isDeleted: false,
    metadata: undefined,
    nodeResults: [],
    organization: new Types.ObjectId(mockOrgId),
    progress: 0,
    save: vi.fn().mockImplementation(function (this: unknown) {
      return Promise.resolve(this);
    }),
    startedAt: null,
    status: WorkflowExecutionStatus.PENDING,
    trigger: WorkflowExecutionTrigger.MANUAL,
    user: new Types.ObjectId(mockUserId),
    workflow: new Types.ObjectId(mockWorkflowId),
    ...overrides,
  });

  beforeEach(async () => {
    // MockModel must be a vi.fn() so it supports mockImplementationOnce()
    // and can be used as a callable constructor for `new this.model()` in BaseService.create()
    const MockModelConstructor = vi.fn().mockImplementation(function (
      data: Record<string, unknown>,
    ) {
      return { ...data, save: vi.fn().mockResolvedValue(data) };
    });
    MockModelConstructor.collection = { name: 'workflow-executions' };
    MockModelConstructor.modelName = 'WorkflowExecution';
    MockModelConstructor.aggregate = vi.fn().mockResolvedValue([]);
    MockModelConstructor.aggregatePaginate = vi.fn().mockResolvedValue({
      docs: [],
      hasNextPage: false,
      hasPrevPage: false,
      limit: 20,
      page: 1,
      totalDocs: 0,
      totalPages: 0,
    });
    MockModelConstructor.create = vi.fn();
    MockModelConstructor.find = vi.fn();
    MockModelConstructor.findById = vi.fn();
    MockModelConstructor.findByIdAndUpdate = vi.fn();
    MockModelConstructor.findOne = vi.fn();

    mockModel = MockModelConstructor as unknown as Record<string, vi.Mock>;

    mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowExecutionsService,
        {
          provide: getModelToken(WorkflowExecution.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<WorkflowExecutionsService>(WorkflowExecutionsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('service definition', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('should find execution with default population', async () => {
      const mockExecution = createMockExecution();

      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockExecution),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findOne({ _id: mockExecutionId });

      expect(mockModel.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should find execution with custom population', async () => {
      const mockExecution = createMockExecution();

      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockExecution),
        populate: vi.fn().mockReturnThis(),
      });

      await service.findOne({ _id: mockExecutionId }, [
        { path: 'workflow', select: 'label' },
      ]);

      expect(mockModel.findOne).toHaveBeenCalled();
    });

    it('should return null when execution not found', async () => {
      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findOne({ _id: 'non-existent' });

      expect(result).toBeNull();
    });
  });

  describe('createExecution', () => {
    it('should create a new execution with correct defaults', async () => {
      const dto: CreateWorkflowExecutionDto = {
        inputValues: { topic: 'AI' },
        trigger: WorkflowExecutionTrigger.MANUAL,
        workflow: new Types.ObjectId(mockWorkflowId),
      };

      const createdExecution = createMockExecution({
        ...dto,
        nodeResults: [],
        organization: new Types.ObjectId(mockOrgId),
        progress: 0,
        status: WorkflowExecutionStatus.PENDING,
        user: new Types.ObjectId(mockUserId),
      });

      // BaseService.create() uses new this.model(dto).save() — MockModelConstructor handles this
      // Override MockModelConstructor to return a specific save result
      (mockModel as unknown as vi.Mock).mockImplementationOnce(function () {
        return createdExecution;
      });

      const result = await service.createExecution(mockUserId, mockOrgId, dto);

      expect(result).toBeDefined();
    });

    it('should create execution with scheduled trigger', async () => {
      const dto: CreateWorkflowExecutionDto = {
        inputValues: {},
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        workflow: new Types.ObjectId(mockWorkflowId),
      };

      const createdExecution = createMockExecution({ ...dto });
      (mockModel as unknown as vi.Mock).mockImplementationOnce(function () {
        return createdExecution;
      });

      const result = await service.createExecution(mockUserId, mockOrgId, dto);

      expect(result).toBeDefined();
    });

    it('should convert string IDs to ObjectIds', async () => {
      const dto: CreateWorkflowExecutionDto = {
        trigger: WorkflowExecutionTrigger.MANUAL,
        workflow: new Types.ObjectId(mockWorkflowId),
      };

      let capturedData: Record<string, unknown> | undefined;
      (mockModel as unknown as vi.Mock).mockImplementationOnce(function (
        data: Record<string, unknown>,
      ) {
        capturedData = data;
        return { ...data, save: vi.fn().mockResolvedValue(data) };
      });

      await service.createExecution(mockUserId, mockOrgId, dto);

      expect(capturedData).toMatchObject({
        organization: expect.any(Types.ObjectId),
        user: expect.any(Types.ObjectId),
      });
    });
  });

  describe('startExecution', () => {
    it('should start execution and set startedAt', async () => {
      const startedExecution = createMockExecution({
        startedAt: new Date(),
        status: WorkflowExecutionStatus.RUNNING,
      });

      mockModel.findByIdAndUpdate.mockResolvedValue(startedExecution);

      const result = await service.startExecution(mockExecutionId);

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockExecutionId,
        {
          startedAt: expect.any(Date),
          status: WorkflowExecutionStatus.RUNNING,
        },
        { returnDocument: 'after' },
      );
      expect(result?.status).toBe(WorkflowExecutionStatus.RUNNING);
    });

    it('should return null when execution not found', async () => {
      mockModel.findByIdAndUpdate.mockResolvedValue(null);

      const result = await service.startExecution('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('completeExecution', () => {
    it('should complete execution successfully', async () => {
      const mockExecution = createMockExecution({
        metadata: {
          eta: {
            estimatedDurationMs: 4500,
            startedAt: new Date(Date.now() - 5000).toISOString(),
          },
        },
        startedAt: new Date(Date.now() - 5000),
        status: WorkflowExecutionStatus.RUNNING,
      });

      mockModel.findById.mockResolvedValue(mockExecution);

      const completedExecution = createMockExecution({
        completedAt: new Date(),
        durationMs: 5000,
        progress: 100,
        status: WorkflowExecutionStatus.COMPLETED,
      });

      mockModel.findByIdAndUpdate.mockResolvedValue(completedExecution);

      const result = await service.completeExecution(mockExecutionId);

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockExecutionId,
        expect.objectContaining({
          completedAt: expect.any(Date),
          durationMs: expect.any(Number),
          metadata: expect.objectContaining({
            eta: expect.objectContaining({
              actualDurationMs: expect.any(Number),
              currentPhase: 'Completed',
              remainingDurationMs: 0,
            }),
          }),
          progress: 100,
          status: WorkflowExecutionStatus.COMPLETED,
        }),
        { returnDocument: 'after' },
      );
      expect(result?.status).toBe(WorkflowExecutionStatus.COMPLETED);
    });

    it('should complete execution with error (failed status)', async () => {
      const mockExecution = createMockExecution({
        startedAt: new Date(Date.now() - 5000),
        status: WorkflowExecutionStatus.RUNNING,
      });

      mockModel.findById.mockResolvedValue(mockExecution);

      const failedExecution = createMockExecution({
        error: 'Something went wrong',
        status: WorkflowExecutionStatus.FAILED,
      });

      mockModel.findByIdAndUpdate.mockResolvedValue(failedExecution);

      const result = await service.completeExecution(
        mockExecutionId,
        'Something went wrong',
      );

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockExecutionId,
        expect.objectContaining({
          error: 'Something went wrong',
          status: WorkflowExecutionStatus.FAILED,
        }),
        { returnDocument: 'after' },
      );
      expect(result?.status).toBe(WorkflowExecutionStatus.FAILED);
    });

    it('should return null when execution not found', async () => {
      mockModel.findById.mockResolvedValue(null);

      const result = await service.completeExecution('non-existent');

      expect(result).toBeNull();
    });

    it('should calculate duration as 0 when startedAt is not set', async () => {
      const mockExecution = createMockExecution({
        startedAt: null,
        status: WorkflowExecutionStatus.RUNNING,
      });

      mockModel.findById.mockResolvedValue(mockExecution);
      mockModel.findByIdAndUpdate.mockResolvedValue(
        createMockExecution({ durationMs: 0 }),
      );

      await service.completeExecution(mockExecutionId);

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockExecutionId,
        expect.objectContaining({
          durationMs: 0,
        }),
        { returnDocument: 'after' },
      );
    });
  });

  describe('updateExecutionMetadata', () => {
    it('should merge metadata updates onto the existing execution metadata', async () => {
      const mockExecution = createMockExecution({
        metadata: {
          eta: { currentPhase: 'Queued' },
          platform: 'manual',
        },
        save: vi.fn().mockImplementation(function (this: unknown) {
          return Promise.resolve(this);
        }),
      });

      mockModel.findById.mockResolvedValue(mockExecution);

      await service.updateExecutionMetadata(mockExecutionId, {
        eta: { currentPhase: 'Running node' },
      });

      expect(mockExecution.metadata).toEqual({
        eta: { currentPhase: 'Running node' },
        platform: 'manual',
      });
      expect(mockExecution.save).toHaveBeenCalled();
    });
  });

  describe('cancelExecution', () => {
    it('should cancel execution', async () => {
      const cancelledExecution = createMockExecution({
        completedAt: new Date(),
        status: WorkflowExecutionStatus.CANCELLED,
      });

      mockModel.findByIdAndUpdate.mockResolvedValue(cancelledExecution);

      const result = await service.cancelExecution(mockExecutionId);

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockExecutionId,
        {
          completedAt: expect.any(Date),
          status: WorkflowExecutionStatus.CANCELLED,
        },
        { returnDocument: 'after' },
      );
      expect(result?.status).toBe(WorkflowExecutionStatus.CANCELLED);
    });

    it('should return null when execution not found', async () => {
      mockModel.findByIdAndUpdate.mockResolvedValue(null);

      const result = await service.cancelExecution('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateNodeResult', () => {
    it('should add new node result to execution', async () => {
      const mockExecution = createMockExecution({
        nodeResults: [],
        save: vi.fn().mockImplementation(function (this: unknown) {
          return Promise.resolve(this);
        }),
      });

      mockModel.findById.mockResolvedValue(mockExecution);

      const nodeResult: WorkflowNodeResult = {
        completedAt: new Date(),
        nodeId: 'node-1',
        nodeType: 'text-generator',
        output: { text: 'Generated text' },
        startedAt: new Date(),
        status: WorkflowExecutionStatus.COMPLETED,
      };

      const _result = await service.updateNodeResult(
        mockExecutionId,
        nodeResult,
        5,
      );

      expect(mockExecution.nodeResults).toContainEqual(nodeResult);
      expect(mockExecution.save).toHaveBeenCalled();
    });

    it('should update existing node result', async () => {
      const existingNodeResult: WorkflowNodeResult = {
        nodeId: 'node-1',
        nodeType: 'text-generator',
        startedAt: new Date(),
        status: WorkflowExecutionStatus.RUNNING,
      };

      const mockExecution = createMockExecution({
        nodeResults: [existingNodeResult],
        save: vi.fn().mockImplementation(function (this: unknown) {
          return Promise.resolve(this);
        }),
      });

      mockModel.findById.mockResolvedValue(mockExecution);

      const updatedNodeResult: WorkflowNodeResult = {
        completedAt: new Date(),
        nodeId: 'node-1',
        nodeType: 'text-generator',
        output: { text: 'Generated text' },
        startedAt: existingNodeResult.startedAt,
        status: WorkflowExecutionStatus.COMPLETED,
      };

      await service.updateNodeResult(mockExecutionId, updatedNodeResult, 5);

      expect(mockExecution.nodeResults[0].status).toBe(
        WorkflowExecutionStatus.COMPLETED,
      );
    });

    it('should calculate progress based on totalNodes', async () => {
      const mockExecution = createMockExecution({
        nodeResults: [
          {
            nodeId: 'node-1',
            nodeType: 'text-generator',
            status: WorkflowExecutionStatus.COMPLETED,
          },
        ],
        progress: 0,
        save: vi.fn().mockImplementation(function (this: unknown) {
          return Promise.resolve(this);
        }),
      });

      mockModel.findById.mockResolvedValue(mockExecution);

      const newNodeResult: WorkflowNodeResult = {
        completedAt: new Date(),
        nodeId: 'node-2',
        nodeType: 'image-generator',
        startedAt: new Date(),
        status: WorkflowExecutionStatus.COMPLETED,
      };

      await service.updateNodeResult(mockExecutionId, newNodeResult, 4);

      // 2 completed out of 4 total = 50%
      expect(mockExecution.progress).toBe(50);
    });

    it('should calculate progress without totalNodes parameter', async () => {
      const mockExecution = createMockExecution({
        nodeResults: [],
        progress: 0,
        save: vi.fn().mockImplementation(function (this: unknown) {
          return Promise.resolve(this);
        }),
      });

      mockModel.findById.mockResolvedValue(mockExecution);

      const nodeResult: WorkflowNodeResult = {
        completedAt: new Date(),
        nodeId: 'node-1',
        nodeType: 'text-generator',
        startedAt: new Date(),
        status: WorkflowExecutionStatus.COMPLETED,
      };

      await service.updateNodeResult(mockExecutionId, nodeResult);

      // 1 completed out of 1 = 100%
      expect(mockExecution.progress).toBe(100);
    });

    it('should return null when execution not found', async () => {
      mockModel.findById.mockResolvedValue(null);

      const result = await service.updateNodeResult('non-existent', {
        nodeId: 'node-1',
        nodeType: 'text',
        status: WorkflowExecutionStatus.COMPLETED,
      });

      expect(result).toBeNull();
    });

    it('should handle zero expectedNodes gracefully', async () => {
      const mockExecution = createMockExecution({
        nodeResults: [],
        progress: 0,
        save: vi.fn().mockImplementation(function (this: unknown) {
          return Promise.resolve(this);
        }),
      });

      mockModel.findById.mockResolvedValue(mockExecution);

      const nodeResult: WorkflowNodeResult = {
        nodeId: 'node-1',
        nodeType: 'text',
        startedAt: new Date(),
        status: WorkflowExecutionStatus.RUNNING,
      };

      await service.updateNodeResult(mockExecutionId, nodeResult, 0);

      expect(mockExecution.progress).toBe(0);
    });

    it('should count failed nodes as completed for progress', async () => {
      const mockExecution = createMockExecution({
        nodeResults: [
          {
            nodeId: 'node-1',
            nodeType: 'text-generator',
            status: WorkflowExecutionStatus.FAILED,
          },
        ],
        progress: 0,
        save: vi.fn().mockImplementation(function (this: unknown) {
          return Promise.resolve(this);
        }),
      });

      mockModel.findById.mockResolvedValue(mockExecution);

      const newNodeResult: WorkflowNodeResult = {
        completedAt: new Date(),
        nodeId: 'node-2',
        nodeType: 'image-generator',
        startedAt: new Date(),
        status: WorkflowExecutionStatus.COMPLETED,
      };

      await service.updateNodeResult(mockExecutionId, newNodeResult, 2);

      // 2 finished (1 failed + 1 completed) out of 2 = 100%
      expect(mockExecution.progress).toBe(100);
    });
  });

  describe('getWorkflowExecutions', () => {
    it('should get executions for a workflow with pagination', async () => {
      const mockExecutions = [
        createMockExecution(),
        createMockExecution({ _id: new Types.ObjectId() }),
      ];

      mockModel.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockExecutions),
        lean: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      });

      const result = await service.getWorkflowExecutions(
        mockWorkflowId,
        mockOrgId,
        10,
        0,
      );

      expect(mockModel.find).toHaveBeenCalledWith({
        isDeleted: false,
        organization: expect.any(Types.ObjectId),
        workflow: expect.any(Types.ObjectId),
      });
      expect(result).toHaveLength(2);
    });

    it('should use default limit and offset', async () => {
      const findChainMock = {
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };

      mockModel.find.mockReturnValue(findChainMock);

      await service.getWorkflowExecutions(mockWorkflowId, mockOrgId);

      expect(findChainMock.skip).toHaveBeenCalledWith(0);
      expect(findChainMock.limit).toHaveBeenCalledWith(20);
    });

    it('should return empty array when no executions found', async () => {
      mockModel.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      });

      const result = await service.getWorkflowExecutions(
        mockWorkflowId,
        mockOrgId,
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('getExecutionStats', () => {
    it('should return execution statistics', async () => {
      const mockStats = {
        avgDurationMs: 5000,
        completed: 80,
        failed: 15,
        total: 100,
      };

      mockModel.aggregate.mockResolvedValue([mockStats]);

      const result = await service.getExecutionStats(mockWorkflowId, mockOrgId);

      expect(mockModel.aggregate).toHaveBeenCalledWith([
        {
          $match: {
            isDeleted: false,
            organization: expect.any(Types.ObjectId),
            workflow: expect.any(Types.ObjectId),
          },
        },
        {
          $group: expect.objectContaining({
            _id: null,
            total: { $sum: 1 },
          }),
        },
      ]);
      expect(result).toEqual(mockStats);
    });

    it('should return default stats when no executions found', async () => {
      mockModel.aggregate.mockResolvedValue([]);

      const result = await service.getExecutionStats(mockWorkflowId, mockOrgId);

      expect(result).toEqual({
        avgDurationMs: 0,
        completed: 0,
        failed: 0,
        total: 0,
      });
    });

    it('should handle null avgDurationMs', async () => {
      const mockStats = {
        avgDurationMs: null,
        completed: 5,
        failed: 0,
        total: 5,
      };

      mockModel.aggregate.mockResolvedValue([mockStats]);

      const result = await service.getExecutionStats(mockWorkflowId, mockOrgId);

      expect(result.avgDurationMs).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle ObjectId conversion for all methods', async () => {
      // Test that string IDs are properly converted to ObjectIds
      const stringWorkflowId = new Types.ObjectId().toString();
      const stringOrgId = new Types.ObjectId().toString();

      mockModel.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      });

      await service.getWorkflowExecutions(stringWorkflowId, stringOrgId);

      expect(mockModel.find).toHaveBeenCalledWith({
        isDeleted: false,
        organization: expect.any(Types.ObjectId),
        workflow: expect.any(Types.ObjectId),
      });
    });

    it('should handle concurrent node result updates', async () => {
      const mockExecution = createMockExecution({
        nodeResults: [],
        save: vi.fn().mockImplementation(function (this: unknown) {
          return Promise.resolve(this);
        }),
      });

      mockModel.findById.mockResolvedValue(mockExecution);

      const nodeResult1: WorkflowNodeResult = {
        nodeId: 'node-1',
        nodeType: 'text',
        startedAt: new Date(),
        status: WorkflowExecutionStatus.RUNNING,
      };

      const nodeResult2: WorkflowNodeResult = {
        nodeId: 'node-2',
        nodeType: 'image',
        startedAt: new Date(),
        status: WorkflowExecutionStatus.RUNNING,
      };

      await Promise.all([
        service.updateNodeResult(mockExecutionId, nodeResult1, 2),
        service.updateNodeResult(mockExecutionId, nodeResult2, 2),
      ]);

      expect(mockExecution.save).toHaveBeenCalled();
    });
  });
});
