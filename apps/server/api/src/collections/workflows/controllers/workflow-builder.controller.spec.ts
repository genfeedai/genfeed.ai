import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { WorkflowBuilderController } from '@api/collections/workflows/controllers/workflow-builder.controller';
import { WorkflowFormatConverterService } from '@api/collections/workflows/services/workflow-format-converter.service';
import { WorkflowGenerationService } from '@api/collections/workflows/services/workflow-generation.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('WorkflowBuilderController', () => {
  let controller: WorkflowBuilderController;

  const mockRequest = {} as Request;

  const mockUser: User = {
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockWorkflowsService = {
    createWorkflow: vi.fn(),
    findOwnedOrThrow: vi.fn(),
  };

  const mockWorkflowGenerationService = {
    generateWorkflowFromDescription: vi.fn(),
  };

  const mockFormatConverterService = {
    convertCoreToCloud: vi.fn(),
    ensureCloudFormat: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowBuilderController],
      providers: [
        { provide: WorkflowsService, useValue: mockWorkflowsService },
        {
          provide: WorkflowGenerationService,
          useValue: mockWorkflowGenerationService,
        },
        {
          provide: WorkflowFormatConverterService,
          useValue: mockFormatConverterService,
        },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkflowBuilderController>(
      WorkflowBuilderController,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('importWorkflow', () => {
    it('should preserve a service-thrown HttpException status instead of downgrading to 500', async () => {
      mockFormatConverterService.ensureCloudFormat.mockReturnValue({
        unmappedNodeTypes: [],
        warnings: [],
        workflow: { edges: [], name: 'Imported', nodes: [] },
      });
      mockWorkflowsService.createWorkflow.mockRejectedValue(
        new BadRequestException('Invalid workflow payload'),
      );

      await expect(
        controller.importWorkflow(
          mockRequest,
          { format: 'cloud', workflow: {} } as never,
          mockUser,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
