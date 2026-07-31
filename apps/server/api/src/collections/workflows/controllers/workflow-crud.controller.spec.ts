import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { WorkflowCrudController } from '@api/collections/workflows/controllers/workflow-crud.controller';
import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
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
  let controller: WorkflowCrudController;
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
        label: 'Test Workflow',
        steps: [],
      };

      mockWorkflowsService.createWorkflow.mockResolvedValue(mockWorkflow);

      const result = await controller.create(mockRequest, createDto, mockUser);

      expect(service.createWorkflow).toHaveBeenCalledWith(
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
        createDto,
        undefined,
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
        organization: mockUser.publicMetadata.organization,
      });
      expect(aggregateArg.where.OR).toBeUndefined();
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
      expect(aggregateArg.where.OR).toEqual([
        { user: mockUser.publicMetadata.user },
        {
          metadata: {
            equals: 'organization',
            path: ['systemWorkflow', 'visibility'],
          },
        },
      ]);
      expect(result).toBeDefined();
    });

    it('should restrict the visible list to the requested brand', async () => {
      const brandId = '507f1f77bcf86cd799439099';
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
        organization: mockUser.publicMetadata.organization,
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
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
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
      ).toHaveBeenCalledWith(mockUser.publicMetadata.organization);
      expect(result).toEqual({ data: catalog });
    });
  });

  describe('findOne', () => {
    it('should return a workflow by id via the ownership guard', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockWorkflowsService.findVisibleOrThrow.mockResolvedValue(mockWorkflow);

      const result = await controller.findOne(mockRequest, id, mockUser);

      expect(service.findVisibleOrThrow).toHaveBeenCalledWith(id, {
        organization: mockUser.publicMetadata.organization,
        user: mockUser.publicMetadata.user,
      });
      expect(result).toBeDefined();
    });
  });

  describe('create with sourceWorkflowId', () => {
    it('should clone via create body', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockWorkflowsService.createWorkflow.mockResolvedValue({
        ...mockWorkflow,
        _id: '507f1f77bcf86cd799439015',
        label: 'Test Workflow (Copy)',
      });

      const result = await controller.create(
        mockRequest,
        { sourceWorkflowId: id } as never,
        mockUser,
      );

      expect(service.createWorkflow).toHaveBeenCalledWith(
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
        { sourceWorkflowId: id },
        mockUser.publicMetadata.brand,
      );
      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update a workflow', async () => {
      const id = '507f1f77bcf86cd799439014';
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
        organization: mockUser.publicMetadata.organization,
        user: mockUser.publicMetadata.user,
      });
      expect(service.patch).toHaveBeenCalledWith(id, updateDto);
      expect(result).toBeDefined();
    });

    it('should call workflowSchedulerService.updateSchedule and not a plain patch for schedule fields', async () => {
      const id = '507f1f77bcf86cd799439014';
      const updateDto: UpdateWorkflowDto = {
        isScheduleEnabled: true,
        schedule: '0 9 * * *',
        timezone: 'UTC',
      };

      mockWorkflowsService.findMutableOwnedOrThrow.mockResolvedValue(
        mockWorkflow,
      );
      mockWorkflowsService.findOwnedOrThrow.mockResolvedValue({
        ...mockWorkflow,
        ...updateDto,
      });

      const result = await controller.update(
        mockRequest,
        id,
        updateDto,
        mockUser,
      );

      expect(mockWorkflowSchedulerService.updateSchedule).toHaveBeenCalledWith(
        id,
        '0 9 * * *',
        'UTC',
        true,
      );
      expect(mockWorkflowsService.patch).not.toHaveBeenCalled();
      expect(mockWorkflowsService.findOwnedOrThrow).toHaveBeenCalledWith(id, {
        organization: mockUser.publicMetadata.organization,
        user: mockUser.publicMetadata.user,
      });
      expect(result).toBeDefined();
    });

    it('should call publishToMarketplace when isPublic and isTemplate are both true', async () => {
      const id = '507f1f77bcf86cd799439014';
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
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
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
      const id = '507f1f77bcf86cd799439014';
      mockWorkflowsService.findMutableOwnedOrThrow.mockResolvedValue(
        mockWorkflow,
      );
      mockWorkflowsService.remove.mockResolvedValue(mockWorkflow);

      const result = await controller.remove(mockRequest, id, mockUser);

      expect(service.findMutableOwnedOrThrow).toHaveBeenCalledWith(id, {
        organization: mockUser.publicMetadata.organization,
        user: mockUser.publicMetadata.user,
      });
      expect(service.remove).toHaveBeenCalledWith(id);
      expect(result).toBeDefined();
    });

    it('should reject deleting immutable system workflows', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockWorkflowsService.findMutableOwnedOrThrow.mockRejectedValue(
        new ForbiddenException(
          'System workflows are immutable. Duplicate the workflow before editing or deleting it.',
        ),
      );

      await expect(
        controller.remove(mockRequest, id, mockUser),
      ).rejects.toThrow('System workflows are immutable');

      expect(service.findMutableOwnedOrThrow).toHaveBeenCalledWith(id, {
        organization: mockUser.publicMetadata.organization,
        user: mockUser.publicMetadata.user,
      });
      expect(service.remove).not.toHaveBeenCalled();
    });
  });
});
