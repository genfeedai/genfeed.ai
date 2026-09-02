import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { WorkflowCrudController } from '@api/collections/workflows/controllers/workflow-crud.controller';
import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { WorkflowQueryDto } from '@api/collections/workflows/dto/query-workflow.dto';
import { UpdateWorkflowDto } from '@api/collections/workflows/dto/update-workflow.dto';
import { SystemWorkflowCatalogService } from '@api/collections/workflows/services/system-workflow-catalog.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { WorkflowStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('WorkflowCrudController', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440001';
  const organizationId = '550e8400-e29b-41d4-a716-446655440002';
  const workflowId = '550e8400-e29b-41d4-a716-446655440003';
  const brandId = '550e8400-e29b-41d4-a716-446655440004';
  let controller: WorkflowCrudController;
  let service: WorkflowsService;

  const mockRequest = {} as Request;

  const mockUser: User = {
    brandId: brandId,
    organizationId: organizationId,
    userId: userId,
  } as unknown as User;

  const mockSuperAdminUser: User = {
    ...mockUser,
    isSuperAdmin: true,
  } as unknown as User;

  const mockWorkflow = {
    id: workflowId,
    createdAt: new Date(),
    description: 'Automated content workflow',
    isDeleted: false,
    label: 'Test Workflow',
    organizationId,
    status: WorkflowStatus.DRAFT,
    updatedAt: new Date(),
    userId,
  };

  const mockWorkflowsService = {
    createWorkflow: vi.fn(),
    findAll: vi.fn(),
    findMutableOwnedOrThrow: vi.fn(),
    findOwnedOrThrow: vi.fn(),
    findVisibleOrThrow: vi.fn(),
    getWorkflowStatistics: vi.fn(),
    patch: vi.fn(),
    publishToMarketplace: vi.fn(),
    remove: vi.fn(),
  };

  const mockWorkflowSchedulerService = {
    updateSchedule: vi.fn(),
  };

  const mockSystemWorkflowCatalogService = {
    listCatalogForOrganization: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowCrudController],
      providers: [
        { provide: WorkflowsService, useValue: mockWorkflowsService },
        {
          provide: WorkflowSchedulerService,
          useValue: mockWorkflowSchedulerService,
        },
        {
          provide: SystemWorkflowCatalogService,
          useValue: mockSystemWorkflowCatalogService,
        },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkflowCrudController>(WorkflowCrudController);
    service = module.get<WorkflowsService>(WorkflowsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a workflow', async () => {
      const createDto: CreateWorkflowDto = {
        description: 'Automated workflow',
        edges: [],
        label: 'Test Workflow',
        nodes: [],
      };

      mockWorkflowsService.createWorkflow.mockResolvedValue(mockWorkflow);

      const result = await controller.create(mockRequest, createDto, mockUser);

      expect(service.createWorkflow).toHaveBeenCalledWith(
        mockUser.userId,
        mockUser.organizationId,
        createDto,
        mockUser.brandId,
      );
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should widen the where clause when query.referencable is truthy', async () => {
      mockWorkflowsService.findAll.mockResolvedValue({
        docs: [],
        totalDocs: 0,
      });

      await controller.findAll(mockRequest, mockUser, { referencable: true });

      expect(mockWorkflowsService.findAll).toHaveBeenCalled();
      const [aggregateArg] =
        mockWorkflowsService.findAll.mock.calls[
          mockWorkflowsService.findAll.mock.calls.length - 1
        ];
      expect(aggregateArg.where).toMatchObject({
        isDeleted: false,
        organizationId: mockUser.organizationId,
        NOT: {
          metadata: {
            equals: 'system-workflow',
            path: ['systemWorkflow', 'kind'],
          },
        },
      });
      expect(aggregateArg.where.OR).toBeUndefined();
      expect(aggregateArg.where.userId).toBeUndefined();
    });

    it('should return all workflows for user', async () => {
      mockWorkflowsService.findAll.mockResolvedValue({
        docs: [mockWorkflow],
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });

      const result = await controller.findAll(mockRequest, mockUser, {});

      expect(service.findAll).toHaveBeenCalled();
      const [aggregateArg] =
        mockWorkflowsService.findAll.mock.calls[
          mockWorkflowsService.findAll.mock.calls.length - 1
        ];
      expect(aggregateArg.where.userId).toBe(mockUser.userId);
      expect(aggregateArg.where.OR).toBeUndefined();
      expect(aggregateArg.where.NOT).toEqual({
        metadata: {
          equals: 'system-workflow',
          path: ['systemWorkflow', 'kind'],
        },
      });
      expect(result).toBeDefined();
    });

    it('includes organization-visible system workflows when includeSystem is set', async () => {
      mockWorkflowsService.findAll.mockResolvedValue({
        docs: [],
        totalDocs: 0,
      });

      await controller.findAll(mockRequest, mockSuperAdminUser, {
        includeSystem: true,
      } as WorkflowQueryDto);

      const [aggregateArg] =
        mockWorkflowsService.findAll.mock.calls[
          mockWorkflowsService.findAll.mock.calls.length - 1
        ];
      expect(aggregateArg.where.OR).toEqual([
        { userId: mockSuperAdminUser.userId },
        {
          metadata: {
            equals: 'organization',
            path: ['systemWorkflow', 'visibility'],
          },
        },
      ]);
      expect(aggregateArg.where.NOT).toBeUndefined();
    });

    it('rejects includeSystem for a non-superadmin before querying workflows', async () => {
      await expect(
        controller.findAll(mockRequest, mockUser, {
          includeSystem: true,
        } as WorkflowQueryDto),
      ).rejects.toMatchObject({ status: 403 });

      expect(mockWorkflowsService.findAll).not.toHaveBeenCalled();
    });

    it('should restrict the visible list to the requested brand', async () => {
      mockWorkflowsService.findAll.mockResolvedValue({
        docs: [],
        totalDocs: 0,
      });

      await controller.findAll(mockRequest, mockUser, { brandId });

      const [aggregateArg] =
        mockWorkflowsService.findAll.mock.calls[
          mockWorkflowsService.findAll.mock.calls.length - 1
        ];
      expect(aggregateArg.where).toMatchObject({
        brandId,
        organizationId: mockUser.organizationId,
      });
    });
  });

  describe('findAll view=statistics', () => {
    it('should return workflow statistics via the collection view', async () => {
      const stats = { active: 5, completed: 2, draft: 3, total: 10 };
      mockWorkflowsService.getWorkflowStatistics.mockResolvedValue(stats);

      const result = await controller.findAll(mockRequest, mockUser, {
        view: 'statistics',
      });

      expect(service.getWorkflowStatistics).toHaveBeenCalledWith(
        mockUser.userId,
        mockUser.organizationId,
      );
      expect(result).toEqual({ data: stats });
    });
  });

  describe('findAll source=system-catalog', () => {
    it('returns the explicit raw catalog list response contract', async () => {
      const catalog = [
        {
          canonicalId: 'daily-trends-digest',
          installed: false,
          installedWorkflowId: null,
        },
      ];
      mockSystemWorkflowCatalogService.listCatalogForOrganization.mockResolvedValue(
        catalog,
      );

      const result = await controller.findAll(mockRequest, mockUser, {
        source: 'system-catalog',
      });

      expect(
        mockSystemWorkflowCatalogService.listCatalogForOrganization,
      ).toHaveBeenCalledWith(mockUser.organizationId);
      expect(result).toEqual({ data: catalog });
    });
  });

  describe('findOne', () => {
    it('should return a workflow by id via the ownership guard', async () => {
      const id = workflowId;
      mockWorkflowsService.findVisibleOrThrow.mockResolvedValue(mockWorkflow);

      const result = await controller.findOne(mockRequest, id, mockUser);

      expect(service.findVisibleOrThrow).toHaveBeenCalledWith(id, {
        organizationId: mockUser.organizationId,
        userId: mockUser.userId,
      });
      expect(result).toBeDefined();
    });
  });

  describe('create with sourceWorkflowId', () => {
    it('should clone via create body', async () => {
      const id = workflowId;
      mockWorkflowsService.createWorkflow.mockResolvedValue({
        ...mockWorkflow,
        id: '550e8400-e29b-41d4-a716-446655440005',
        label: 'Test Workflow (Copy)',
      });

      const result = await controller.create(
        mockRequest,
        { sourceWorkflowId: id } as never,
        mockUser,
      );

      expect(service.createWorkflow).toHaveBeenCalledWith(
        mockUser.userId,
        mockUser.organizationId,
        { sourceWorkflowId: id },
        mockUser.brandId,
      );
      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update a workflow', async () => {
      const id = workflowId;
      const updateDto: UpdateWorkflowDto = { label: 'Updated Workflow' };

      mockWorkflowsService.findMutableOwnedOrThrow.mockResolvedValue(
        mockWorkflow,
      );
      mockWorkflowsService.patch.mockResolvedValue({
        ...mockWorkflow,
        ...updateDto,
      });

      const result = await controller.update(
        mockRequest,
        id,
        updateDto,
        mockUser,
      );

      expect(service.findMutableOwnedOrThrow).toHaveBeenCalledWith(id, {
        organizationId: mockUser.organizationId,
        userId: mockUser.userId,
      });
      expect(service.patch).toHaveBeenCalledWith(id, updateDto);
      expect(result).toBeDefined();
    });

    it('should call workflowSchedulerService.updateSchedule and not a plain patch for schedule fields', async () => {
      const id = workflowId;
      const updateDto: UpdateWorkflowDto = {
        isScheduleEnabled: true,
        schedule: '0 9 * * *',
        timezone: 'UTC',
      };

      mockWorkflowsService.findVisibleOrThrow.mockResolvedValue({
        ...mockWorkflow,
        ...updateDto,
      });

      const result = await controller.update(
        mockRequest,
        id,
        updateDto,
        mockUser,
      );

      expect(mockWorkflowsService.findVisibleOrThrow).toHaveBeenCalledWith(id, {
        organizationId: mockUser.organizationId,
        userId: mockUser.userId,
      });
      expect(
        mockWorkflowsService.findMutableOwnedOrThrow,
      ).not.toHaveBeenCalled();
      expect(mockWorkflowSchedulerService.updateSchedule).toHaveBeenCalledWith(
        id,
        '0 9 * * *',
        'UTC',
        true,
      );
      expect(mockWorkflowsService.patch).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('uses the visible-row guard for schedule-only patches so system workflows can be paused', async () => {
      const id = workflowId;
      const updateDto: UpdateWorkflowDto = {
        isScheduleEnabled: false,
        schedule: '0 8 * * *',
      };

      mockWorkflowsService.findVisibleOrThrow.mockResolvedValue({
        ...mockWorkflow,
        isScheduleEnabled: true,
        schedule: '0 8 * * *',
      });

      await controller.update(mockRequest, id, updateDto, mockUser);

      expect(
        mockWorkflowsService.findMutableOwnedOrThrow,
      ).not.toHaveBeenCalled();
      expect(mockWorkflowsService.findVisibleOrThrow).toHaveBeenCalledWith(id, {
        organizationId: mockUser.organizationId,
        userId: mockUser.userId,
      });
      expect(mockWorkflowSchedulerService.updateSchedule).toHaveBeenCalledWith(
        id,
        '0 8 * * *',
        'UTC',
        false,
      );
    });

    it('should call publishToMarketplace when isPublic and isTemplate are both true', async () => {
      const id = workflowId;
      const updateDto: UpdateWorkflowDto = {
        isPublic: true,
        isTemplate: true,
      };

      mockWorkflowsService.publishToMarketplace.mockResolvedValue({
        ...mockWorkflow,
        ...updateDto,
      });

      const result = await controller.update(
        mockRequest,
        id,
        updateDto,
        mockUser,
      );

      expect(mockWorkflowsService.publishToMarketplace).toHaveBeenCalledWith(
        id,
        mockUser.userId,
        mockUser.organizationId,
      );
      expect(
        mockWorkflowsService.findMutableOwnedOrThrow,
      ).not.toHaveBeenCalled();
      expect(mockWorkflowsService.patch).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('remove', () => {
    it('should remove a workflow', async () => {
      const id = workflowId;
      mockWorkflowsService.findMutableOwnedOrThrow.mockResolvedValue(
        mockWorkflow,
      );
      mockWorkflowsService.remove.mockResolvedValue(mockWorkflow);

      const result = await controller.remove(mockRequest, id, mockUser);

      expect(service.findMutableOwnedOrThrow).toHaveBeenCalledWith(id, {
        organizationId: mockUser.organizationId,
        userId: mockUser.userId,
      });
      expect(service.remove).toHaveBeenCalledWith(id);
      expect(result).toBeDefined();
    });

    it('should reject deleting immutable system workflows', async () => {
      const id = workflowId;
      mockWorkflowsService.findMutableOwnedOrThrow.mockRejectedValue(
        new ForbiddenException(
          'System workflows are immutable. Duplicate the workflow before editing or deleting it.',
        ),
      );

      await expect(
        controller.remove(mockRequest, id, mockUser),
      ).rejects.toThrow('System workflows are immutable');

      expect(service.findMutableOwnedOrThrow).toHaveBeenCalledWith(id, {
        organizationId: mockUser.organizationId,
        userId: mockUser.userId,
      });
      expect(service.remove).not.toHaveBeenCalled();
    });
  });
});
