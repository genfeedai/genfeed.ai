import { WorkflowMarketplaceController } from '@api/collections/workflows/controllers/workflow-marketplace.controller';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('WorkflowMarketplaceController', () => {
  let controller: WorkflowMarketplaceController;
  let service: WorkflowsService;

  const mockWorkflowsService = {
    findAll: vi.fn(),
    findOwnedOrThrow: vi.fn(),
    getWorkflowTemplates: vi.fn(),
    patch: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowMarketplaceController],
      providers: [
        { provide: WorkflowsService, useValue: mockWorkflowsService },
        { provide: MarketplaceApiClient, useValue: {} },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkflowMarketplaceController>(
      WorkflowMarketplaceController,
    );
    service = module.get<WorkflowsService>(WorkflowsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
});
