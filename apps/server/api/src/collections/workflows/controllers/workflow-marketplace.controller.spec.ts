import { WorkflowMarketplaceController } from '@api/collections/workflows/controllers/workflow-marketplace.controller';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('WorkflowMarketplaceController', () => {
  let controller: WorkflowMarketplaceController;
  let service: WorkflowsService;

  const mockRequest = {} as Request;

  const mockWorkflowsService = {
    findAll: vi.fn(),
    getWorkflowTemplates: vi.fn(),
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
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

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
        {
          name: 'Daily Trend Loop',
          routine: {
            kind: 'productized-daily-routine',
            trackingTasks: [{ key: 'review-trend-brief' }],
          },
          steps: [],
        },
      ];

      mockWorkflowsService.getWorkflowTemplates.mockResolvedValue(templates);

      const result = await controller.getTemplates();

      expect(service.getWorkflowTemplates).toHaveBeenCalled();
      expect(result.data).toEqual(templates);
      expect(result.data[1]).toMatchObject({
        name: 'Daily Trend Loop',
        routine: {
          kind: 'productized-daily-routine',
          trackingTasks: [{ key: 'review-trend-brief' }],
        },
      });
    });
  });

  describe('getMarketplace', () => {
    it('should return public template workflows', async () => {
      mockWorkflowsService.findAll.mockResolvedValue({
        docs: [],
        totalDocs: 0,
      });

      await controller.getMarketplace(mockRequest, {});

      expect(mockWorkflowsService.findAll).toHaveBeenCalled();
      const [aggregateArg] =
        mockWorkflowsService.findAll.mock.calls[
          mockWorkflowsService.findAll.mock.calls.length - 1
        ];
      expect(aggregateArg.where).toMatchObject({
        isDeleted: false,
        isPublic: true,
        isTemplate: true,
      });
    });
  });
});
