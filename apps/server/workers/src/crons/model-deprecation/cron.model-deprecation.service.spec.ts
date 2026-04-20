import { ModelsService } from '@api/collections/models/services/models.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelCategory, WorkflowStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronModelDeprecationService } from '@workers/crons/model-deprecation/cron.model-deprecation.service';

const createMockModel = (overrides: Record<string, unknown> = {}) => ({
  _id: 'model-old-id',
  category: ModelCategory.IMAGE,
  createdAt: new Date('2025-01-01'),
  isActive: true,
  isDeleted: false,
  isHighlighted: true,
  key: 'old-model-v1',
  label: 'Old Model V1',
  succeededBy: 'new-model-v2',
  ...overrides,
});

const createMockSuccessor = (overrides: Record<string, unknown> = {}) => ({
  _id: 'model-new-id',
  category: ModelCategory.IMAGE,
  createdAt: new Date('2025-10-01'),
  isActive: true,
  isDeleted: false,
  key: 'new-model-v2',
  label: 'New Model V2',
  ...overrides,
});

describe('CronModelDeprecationService', () => {
  let service: CronModelDeprecationService;
  let modelsService: {
    find: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let prismaService: {
    workflow: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    modelsService = {
      count: vi.fn().mockResolvedValue(10),
      find: vi.fn().mockResolvedValue([]),
      findAll: vi.fn().mockResolvedValue({ docs: [{ total: 5 }] }),
      findOne: vi.fn().mockResolvedValue(null),
      patch: vi.fn().mockResolvedValue({}),
    };

    prismaService = {
      workflow: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronModelDeprecationService,
        {
          provide: ModelsService,
          useValue: modelsService,
        },
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: LoggerService,
          useValue: loggerService,
        },
      ],
    }).compile();

    service = module.get<CronModelDeprecationService>(
      CronModelDeprecationService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('deprecateSupersededModels', () => {
    it('should deactivate model with successor active 30+ days and low usage', async () => {
      const oldModel = createMockModel();
      const successor = createMockSuccessor({
        // Created 60 days ago -- well past the 30 day threshold
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      });

      // Return old model as deprecation candidate
      modelsService.find.mockImplementation(
        (filter: Record<string, unknown>) => {
          if (filter.succeededBy) {
            return Promise.resolve([oldModel]);
          }
          // Category models for usage calculation
          return Promise.resolve([oldModel, successor]);
        },
      );

      // Successor lookup
      modelsService.findOne.mockResolvedValue(successor);

      // Usage aggregation returns low count
      modelsService.findAll.mockResolvedValue({
        docs: [{ total: 100 }],
      });

      // No active workflows reference this model
      prismaService.workflow.findMany.mockResolvedValue([]);

      const result = await service.deprecateSupersededModels();

      expect(result.deprecated).toBe(1);
      expect(modelsService.patch).toHaveBeenCalledWith('model-old-id', {
        deprecatedAt: expect.any(Date),
        isActive: false,
        isDeprecated: true,
        isHighlighted: false,
      });
    });

    it('should NOT deactivate model still used in active workflows', async () => {
      const oldModel = createMockModel();
      const successor = createMockSuccessor({
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      });

      modelsService.find.mockImplementation(
        (filter: Record<string, unknown>) => {
          if (filter.succeededBy) {
            return Promise.resolve([oldModel]);
          }
          return Promise.resolve([oldModel, successor]);
        },
      );

      modelsService.findOne.mockResolvedValue(successor);
      modelsService.findAll.mockResolvedValue({
        docs: [{ total: 100 }],
      });

      // Model IS referenced in active workflows
      prismaService.workflow.findMany.mockResolvedValue([
        { nodes: [{ config: { model: 'old-model-v1' } }] },
        { nodes: [{ config: { model: 'old-model-v1' } }] },
        { nodes: [{ config: { model: 'old-model-v1' } }] },
      ]);

      const result = await service.deprecateSupersededModels();

      expect(result.deprecated).toBe(0);
      expect(result.skippedDueToWorkflows).toBe(1);
      expect(modelsService.patch).not.toHaveBeenCalled();
    });

    it('should NOT deactivate model without a successor', async () => {
      // No models with succeededBy field
      modelsService.find.mockResolvedValue([]);

      const result = await service.deprecateSupersededModels();

      expect(result.deprecated).toBe(0);
      expect(result.evaluated).toBe(0);
      expect(modelsService.patch).not.toHaveBeenCalled();
    });

    it('should NOT deactivate model whose successor is less than 30 days old', async () => {
      const oldModel = createMockModel();
      const youngSuccessor = createMockSuccessor({
        // Created 10 days ago -- under the 30 day threshold
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      });

      modelsService.find.mockImplementation(
        (filter: Record<string, unknown>) => {
          if (filter.succeededBy) {
            return Promise.resolve([oldModel]);
          }
          return Promise.resolve([oldModel, youngSuccessor]);
        },
      );

      modelsService.findOne.mockResolvedValue(youngSuccessor);

      const result = await service.deprecateSupersededModels();

      expect(result.deprecated).toBe(0);
      expect(result.skippedDueToSuccessorAge).toBe(1);
      expect(modelsService.patch).not.toHaveBeenCalled();
    });

    it('should NOT auto-delete models, only set isActive to false', async () => {
      const oldModel = createMockModel();
      const successor = createMockSuccessor({
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      });

      modelsService.find.mockImplementation(
        (filter: Record<string, unknown>) => {
          if (filter.succeededBy) {
            return Promise.resolve([oldModel]);
          }
          return Promise.resolve([oldModel, successor]);
        },
      );

      modelsService.findOne.mockResolvedValue(successor);
      modelsService.findAll.mockResolvedValue({
        docs: [{ total: 100 }],
      });
      prismaService.workflow.findMany.mockResolvedValue([]);

      await service.deprecateSupersededModels();

      // Verify patch was called with deactivation flags only
      expect(modelsService.patch).toHaveBeenCalledWith('model-old-id', {
        deprecatedAt: expect.any(Date),
        isActive: false,
        isDeprecated: true,
        isHighlighted: false,
      });

      // Verify isDeleted was NOT set -- never auto-delete
      const patchCall = modelsService.patch.mock.calls[0][1];
      expect(patchCall).not.toHaveProperty('isDeleted');
    });

    it('should handle errors gracefully and not crash the cron', async () => {
      modelsService.find.mockRejectedValue(new Error('DB connection lost'));

      const result = await service.deprecateSupersededModels();

      expect(result.deprecated).toBe(0);
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should skip candidate when successor is not found', async () => {
      const oldModel = createMockModel();

      modelsService.find.mockImplementation(
        (filter: Record<string, unknown>) => {
          if (filter.succeededBy) {
            return Promise.resolve([oldModel]);
          }
          return Promise.resolve([]);
        },
      );

      // Successor does not exist
      modelsService.findOne.mockResolvedValue(null);

      const result = await service.deprecateSupersededModels();

      expect(result.deprecated).toBe(0);
      expect(modelsService.patch).not.toHaveBeenCalled();
    });

    it('should process multiple candidates independently', async () => {
      const model1 = createMockModel({ _id: 'model-1', key: 'old-model-1' });
      const model2 = createMockModel({
        _id: 'model-2',
        key: 'old-model-2',
        succeededBy: 'new-model-2b',
      });

      const successor1 = createMockSuccessor({
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        key: 'new-model-v2',
      });

      const successor2 = createMockSuccessor({
        // Too young -- should be skipped
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        key: 'new-model-2b',
      });

      modelsService.find.mockImplementation(
        (filter: Record<string, unknown>) => {
          if (filter.succeededBy) {
            return Promise.resolve([model1, model2]);
          }
          return Promise.resolve([model1, model2, successor1, successor2]);
        },
      );

      modelsService.findOne.mockImplementation(
        (filter: Record<string, unknown>) => {
          if (filter.key === 'new-model-v2') {
            return Promise.resolve(successor1);
          }
          if (filter.key === 'new-model-2b') {
            return Promise.resolve(successor2);
          }
          return Promise.resolve(null);
        },
      );

      modelsService.findAll.mockResolvedValue({
        docs: [{ total: 100 }],
      });
      prismaService.workflow.findMany.mockResolvedValue([]);

      const result = await service.deprecateSupersededModels();

      expect(result.evaluated).toBe(2);
      expect(result.deprecated).toBe(1);
      expect(result.skippedDueToSuccessorAge).toBe(1);
      expect(modelsService.patch).toHaveBeenCalledTimes(1);
      expect(modelsService.patch).toHaveBeenCalledWith('model-1', {
        deprecatedAt: expect.any(Date),
        isActive: false,
        isDeprecated: true,
        isHighlighted: false,
      });
    });

    it('should verify workflow query filters for active statuses', async () => {
      const oldModel = createMockModel();
      const successor = createMockSuccessor({
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      });

      modelsService.find.mockImplementation(
        (filter: Record<string, unknown>) => {
          if (filter.succeededBy) {
            return Promise.resolve([oldModel]);
          }
          return Promise.resolve([oldModel, successor]);
        },
      );

      modelsService.findOne.mockResolvedValue(successor);
      modelsService.findAll.mockResolvedValue({
        docs: [{ total: 100 }],
      });
      prismaService.workflow.findMany.mockResolvedValue([]);

      await service.deprecateSupersededModels();

      expect(prismaService.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
            status: {
              in: [
                WorkflowStatus.ACTIVE as never,
                WorkflowStatus.RUNNING as never,
              ],
            },
          }),
        }),
      );
    });
  });
});
