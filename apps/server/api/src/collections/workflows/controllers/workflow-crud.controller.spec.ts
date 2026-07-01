import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { WorkflowCrudController } from '@api/collections/workflows/controllers/workflow-crud.controller';
import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { UpdateWorkflowDto } from '@api/collections/workflows/dto/update-workflow.dto';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { WorkflowStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
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
    cloneWorkflow: vi.fn(),
    createWorkflow: vi.fn(),
    findAll: vi.fn(),
    findOwnedOrThrow: vi.fn(),
    getWorkflowStatistics: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
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
      );
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
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
      expect(result).toBeDefined();
    });
  });

  describe('getStatistics', () => {
    it('should return workflow statistics', async () => {
      const stats = { active: 5, completed: 2, draft: 3, total: 10 };
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
    it('should return a workflow by id via the ownership guard', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockWorkflowsService.findOwnedOrThrow.mockResolvedValue(mockWorkflow);

      const result = await controller.findOne(mockRequest, id, mockUser);

      expect(service.findOwnedOrThrow).toHaveBeenCalledWith(id, {
        organization: mockUser.publicMetadata.organization,
        user: mockUser.publicMetadata.user,
      });
      expect(result).toBeDefined();
    });
  });

  describe('cloneWorkflow', () => {
    it('should clone a workflow', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockWorkflowsService.cloneWorkflow.mockResolvedValue({
        ...mockWorkflow,
        _id: '507f1f77bcf86cd799439015',
        label: 'Test Workflow (Copy)',
      });

      const result = await controller.cloneWorkflow(mockRequest, id, mockUser);

      expect(service.cloneWorkflow).toHaveBeenCalledWith(
        id,
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
      );
      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update a workflow', async () => {
      const id = '507f1f77bcf86cd799439014';
      const updateDto: UpdateWorkflowDto = { label: 'Updated Workflow' };

      mockWorkflowsService.findOwnedOrThrow.mockResolvedValue(mockWorkflow);
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

      expect(service.findOwnedOrThrow).toHaveBeenCalledWith(id, {
        organization: mockUser.publicMetadata.organization,
        user: mockUser.publicMetadata.user,
      });
      expect(service.patch).toHaveBeenCalledWith(id, updateDto);
      expect(result).toBeDefined();
    });
  });

  describe('remove', () => {
    it('should remove a workflow', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockWorkflowsService.findOwnedOrThrow.mockResolvedValue(mockWorkflow);
      mockWorkflowsService.remove.mockResolvedValue(mockWorkflow);

      const result = await controller.remove(mockRequest, id, mockUser);

      expect(service.remove).toHaveBeenCalledWith(id);
      expect(result).toBeDefined();
    });
  });
});
