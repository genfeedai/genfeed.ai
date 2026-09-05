vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { WorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/workflow-executions.controller';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutionAuthorizationService } from '@api/collections/workflows/services/workflow-execution-authorization.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { BadRequestException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

const organizationId = testId('org');

describe('WorkflowExecutionsController', () => {
  let controller: WorkflowExecutionsController;

  const mockRequest = {} as never;
  const mockUser = {
    id: 'user-123',
    organizationId,
    userId: 'user-123',
  } as never;

  const mockService = {
    cancelExecution: vi.fn(),
    createExecution: vi.fn(),
    findAll: vi.fn(),
    findOneWithAccounting: vi.fn(),
    findOne: vi.fn(),
    getExecutionStats: vi.fn(),
  };
  const mockWorkflowExecutorService = {
    executeManualWorkflow: vi.fn(),
  };
  const mockWorkflowExecutionAuthorizationService = {
    authorize: vi.fn().mockResolvedValue(undefined),
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
          provide: WorkflowExecutionAuthorizationService,
          useValue: mockWorkflowExecutionAuthorizationService,
        },
        {
          provide: ModuleRef,
          useValue: {
            get: vi.fn((token: unknown) =>
              token === WorkflowExecutorService
                ? mockWorkflowExecutorService
                : undefined,
            ),
          },
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
      const mockResult = { docs: [{ id: 'exec-1' }], total: 1 };
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
      const [findAllQuery, options] = mockService.findAll.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];

      expect(findAllQuery).toEqual({
        include: {
          workflow: { select: { description: true, id: true, label: true } },
        },
        orderBy: { createdAt: -1 },
        where: {
          isDeleted: false,
          organizationId: expect.any(String),
          status: 'completed',
        },
      });
      expect(options).toEqual(
        expect.objectContaining({ limit: expect.any(Number), offset: 0 }),
      );
      expect(result).toEqual([{ id: 'exec-1' }]);
    });

    it('should use default limit and offset when not provided', async () => {
      mockService.findAll.mockResolvedValue({ docs: [], total: 0 });

      await controller.findAll(mockRequest, mockUser, {} as never);

      expect(mockService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: -1 },
          where: expect.objectContaining({
            isDeleted: false,
            organizationId: expect.any(String),
          }),
        }),
        expect.objectContaining({ limit: 20, offset: 0 }),
      );
    });

    it('scopes nested workflow brand filters to the current organization', async () => {
      mockService.findAll.mockResolvedValue({ docs: [], total: 0 });

      await controller.findAll(mockRequest, mockUser, {
        brandId: 'brand-from-another-org',
      } as never);

      expect(mockService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isDeleted: false,
            organizationId,
            workflow: {
              brandId: 'brand-from-another-org',
              isDeleted: false,
              organizationId,
            },
          },
        }),
        expect.any(Object),
      );
    });
  });

  describe('getExecutionStats', () => {
    it('should return stats for a workflow', async () => {
      const mockStats = { completed: 10, failed: 2, running: 1 };
      mockService.getExecutionStats.mockResolvedValue(mockStats);

      const result = controller.getExecutionStats(mockUser, 'wf-1');

      expect(mockService.getExecutionStats).toHaveBeenCalledWith(
        'wf-1',
        organizationId,
      );
      expect(result).toEqual(expect.any(Promise));
    });
  });

  describe('findOne', () => {
    it('should return a single execution by id', async () => {
      const mockExecution = {
        id: 'exec-1',
        status: 'completed',
        accounting: null,
      };
      mockService.findOneWithAccounting.mockResolvedValue(mockExecution);

      const result = await controller.findOne(mockRequest, mockUser, 'exec-1');

      expect(mockService.findOneWithAccounting).toHaveBeenCalledWith({
        id: 'exec-1',
        organizationId: organizationId,
      });
      expect(result).toEqual({ ...mockExecution, accounting: null });
    });
  });

  describe('create', () => {
    it('should create a new execution and return serialized result', async () => {
      const mockExecution = { id: 'exec-new', status: 'pending' };
      mockWorkflowExecutorService.executeManualWorkflow.mockResolvedValue({
        executionId: 'exec-new',
      });
      mockService.findOne.mockResolvedValue(mockExecution);

      const dto = {
        inputValues: { prompt: 'hello' },
        metadata: { source: 'builder' },
        trigger: 'api',
        workflowId: 'wf-1',
      } as never;
      const result = await controller.create(mockRequest, mockUser, dto);

      expect(
        mockWorkflowExecutorService.executeManualWorkflow,
      ).toHaveBeenCalledWith(
        'wf-1',
        'user-123',
        organizationId,
        { prompt: 'hello' },
        { source: 'builder' },
        'api',
        undefined,
      );
      expect(
        mockWorkflowExecutionAuthorizationService.authorize,
      ).toHaveBeenCalledWith({
        expectedContextVersion: undefined,
        organizationId: organizationId,
        requestedBrandId: undefined,
        threadId: undefined,
        userId: 'user-123',
        workflowId: 'wf-1',
      });
      expect(mockService.findOne).toHaveBeenCalledWith({
        id: 'exec-new',
        organizationId: organizationId,
      });
      expect(mockService.createExecution).not.toHaveBeenCalled();
      expect(result).toEqual(mockExecution);
    });

    it('passes validated shell scope to the canonical workflow executor', async () => {
      const scope = {
        brandId: 'brand-1',
        contextVersion: 4,
        threadId: 'thread-1',
      };
      mockWorkflowExecutionAuthorizationService.authorize.mockResolvedValueOnce(
        scope,
      );
      mockWorkflowExecutorService.executeManualWorkflow.mockResolvedValue({
        executionId: 'exec-scoped',
      });
      mockService.findOne.mockResolvedValue({ id: 'exec-scoped' });

      await controller.create(mockRequest, mockUser, {
        expectedContextVersion: 4,
        threadId: 'thread-1',
        workflowId: 'wf-1',
      } as never);

      expect(
        mockWorkflowExecutorService.executeManualWorkflow,
      ).toHaveBeenCalledWith(
        'wf-1',
        'user-123',
        organizationId,
        {},
        undefined,
        undefined,
        scope,
      );
    });

    it('rejects invalid shell authority before the workflow engine executes', async () => {
      mockWorkflowExecutionAuthorizationService.authorize.mockRejectedValueOnce(
        new BadRequestException('stale workflow context'),
      );

      await expect(
        controller.create(mockRequest, mockUser, {
          expectedContextVersion: 2,
          threadId: 'thread-1',
          workflowId: 'wf-1',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(
        mockWorkflowExecutorService.executeManualWorkflow,
      ).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should cancel an execution when status is cancelled', async () => {
      const mockExecution = { id: 'exec-1', status: 'running' };
      const mockCancelled = { id: 'exec-1', status: 'cancelled' };
      mockService.findOne.mockResolvedValue(mockExecution);
      mockService.cancelExecution.mockResolvedValue(mockCancelled);

      const result = await controller.update(mockRequest, mockUser, 'exec-1', {
        status: WorkflowExecutionStatus.CANCELLED,
      });

      expect(mockService.findOne).toHaveBeenCalledWith({
        id: 'exec-1',
        organizationId: organizationId,
      });
      expect(mockService.cancelExecution).toHaveBeenCalledWith('exec-1');
      expect(result).toEqual(mockCancelled);
    });

    it('should throw BadRequestException for a non-cancel status', async () => {
      const mockExecution = { id: 'exec-1', status: 'running' };
      mockService.findOne.mockResolvedValue(mockExecution);

      await expect(
        controller.update(mockRequest, mockUser, 'exec-1', {
          status: WorkflowExecutionStatus.COMPLETED,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockService.cancelExecution).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when execution not found', async () => {
      mockService.findOne.mockResolvedValue(null);

      await expect(
        controller.update(mockRequest, mockUser, 'invalid-id', {
          status: WorkflowExecutionStatus.CANCELLED,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
