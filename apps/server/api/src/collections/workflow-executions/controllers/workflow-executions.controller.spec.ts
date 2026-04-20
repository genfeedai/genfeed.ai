vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    organization: '507f1f77bcf86cd799439011',
    user: 'user-123',
  })),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { WorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/workflow-executions.controller';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('WorkflowExecutionsController', () => {
  let controller: WorkflowExecutionsController;

  const mockRequest = {} as never;
  const mockUser = { id: 'user-123' } as never;

  const mockService = {
    cancelExecution: vi.fn(),
    createExecution: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    getExecutionStats: vi.fn(),
    getWorkflowExecutions: vi.fn(),
  };
  const mockWorkflowExecutorService = {
    executeManualWorkflow: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowExecutionsController],
      providers: [
        {
          provide: WorkflowExecutionsService,
          useValue: mockService,
        },
        {
          provide: WorkflowExecutorService,
          useValue: mockWorkflowExecutorService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkflowExecutionsController>(
      WorkflowExecutionsController,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated executions with an aggregation pipeline', async () => {
      const mockResult = { docs: [{ _id: 'exec-1' }], total: 1 };
      mockService.findAll.mockResolvedValue(mockResult);

      const query = { status: 'completed' } as never;
      const result = await controller.findAll(
        mockRequest,
        mockUser,
        query,
        10,
        0,
      );

      expect(mockService.findAll).toHaveBeenCalledTimes(1);
      const [aggregate, options] = mockService.findAll.mock.calls[0] as [
        Array<Record<string, unknown>>,
        Record<string, unknown>,
      ];

      expect(aggregate).toHaveLength(2);
      expect(aggregate[0]).toEqual({
        $match: {
          isDeleted: false,
          organization: expect.any(String),
          status: 'completed',
        },
      });
      expect(aggregate[1]).toEqual({
        $sort: { createdAt: -1 },
      });
      expect(options).toEqual(
        expect.objectContaining({ limit: 10, offset: 0 }),
      );
      expect(result).toEqual([{ _id: 'exec-1' }]);
    });

    it('should use default limit and offset when not provided', async () => {
      mockService.findAll.mockResolvedValue({ docs: [], total: 0 });

      await controller.findAll(mockRequest, mockUser, {} as never);

      expect(mockService.findAll).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ limit: 20, offset: 0 }),
      );
    });
  });

  describe('getWorkflowExecutions', () => {
    it('should return executions for a specific workflow', async () => {
      const mockDocs = [{ _id: 'exec-1' }, { _id: 'exec-2' }];
      mockService.getWorkflowExecutions.mockResolvedValue(mockDocs);

      const result = await controller.getWorkflowExecutions(
        mockRequest,
        mockUser,
        'wf-1',
        10,
        0,
      );

      expect(mockService.getWorkflowExecutions).toHaveBeenCalledWith(
        'wf-1',
        '507f1f77bcf86cd799439011',
        10,
        0,
      );
      expect(result).toEqual(mockDocs);
    });
  });

  describe('getExecutionStats', () => {
    it('should return stats for a workflow', async () => {
      const mockStats = { completed: 10, failed: 2, running: 1 };
      mockService.getExecutionStats.mockResolvedValue(mockStats);

      const result = controller.getExecutionStats(mockUser, 'wf-1');

      expect(mockService.getExecutionStats).toHaveBeenCalledWith(
        'wf-1',
        '507f1f77bcf86cd799439011',
      );
      expect(result).toEqual(expect.any(Promise));
    });
  });

  describe('findOne', () => {
    it('should return a single execution by id', async () => {
      const mockExecution = { _id: 'exec-1', status: 'completed' };
      mockService.findOne.mockResolvedValue(mockExecution);

      const result = await controller.findOne(mockRequest, mockUser, 'exec-1');

      expect(mockService.findOne).toHaveBeenCalledWith({
        _id: 'exec-1',
        isDeleted: false,
        organization: '507f1f77bcf86cd799439011',
      });
      expect(result).toEqual(mockExecution);
    });
  });

  describe('create', () => {
    it('should create a new execution and return serialized result', async () => {
      const mockExecution = { _id: 'exec-new', status: 'pending' };
      mockWorkflowExecutorService.executeManualWorkflow.mockResolvedValue({
        executionId: 'exec-new',
      });
      mockService.findOne.mockResolvedValue(mockExecution);

      const dto = {
        inputValues: { prompt: 'hello' },
        metadata: { source: 'builder' },
        trigger: 'api',
        workflow: 'wf-1',
      } as never;
      const result = await controller.create(mockRequest, mockUser, dto);

      expect(
        mockWorkflowExecutorService.executeManualWorkflow,
      ).toHaveBeenCalledWith(
        'wf-1',
        'user-123',
        '507f1f77bcf86cd799439011',
        { prompt: 'hello' },
        { source: 'builder' },
        'api',
      );
      expect(mockService.findOne).toHaveBeenCalledWith({
        _id: 'exec-new',
        isDeleted: false,
        organization: '507f1f77bcf86cd799439011',
      });
      expect(mockService.createExecution).not.toHaveBeenCalled();
      expect(result).toEqual(mockExecution);
    });
  });

  describe('cancel', () => {
    it('should cancel an execution when it exists', async () => {
      const mockExecution = { _id: 'exec-1', status: 'running' };
      const mockCancelled = { _id: 'exec-1', status: 'cancelled' };
      mockService.findOne.mockResolvedValue(mockExecution);
      mockService.cancelExecution.mockResolvedValue(mockCancelled);

      const result = await controller.cancel(mockRequest, mockUser, 'exec-1');

      expect(mockService.findOne).toHaveBeenCalledWith({
        _id: 'exec-1',
        isDeleted: false,
        organization: '507f1f77bcf86cd799439011',
      });
      expect(mockService.cancelExecution).toHaveBeenCalledWith('exec-1');
      expect(result).toEqual(mockCancelled);
    });

    it('should throw NotFoundException when execution not found', async () => {
      mockService.findOne.mockResolvedValue(null);

      await expect(
        controller.cancel(mockRequest, mockUser, 'invalid-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
