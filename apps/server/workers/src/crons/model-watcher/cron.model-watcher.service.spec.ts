import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import { CronModelWatcherService } from '@workers/crons/model-watcher/cron.model-watcher.service';
import { FalDiscoveryService } from '@workers/services/fal-discovery.service';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';
import { ModelPricingService } from '@workers/services/model-pricing.service';

describe('CronModelWatcherService', () => {
  let service: CronModelWatcherService;
  let modelsService: vi.Mocked<ModelsService>;
  let modelDiscoveryService: vi.Mocked<ModelDiscoveryService>;
  let modelPricingService: vi.Mocked<ModelPricingService>;
  let configService: vi.Mocked<ConfigService>;
  let loggerService: vi.Mocked<LoggerService>;
  let falDiscoveryService: vi.Mocked<FalDiscoveryService>;
  let notificationsService: vi.Mocked<NotificationsService>;

  const mockExistingModels = [
    {
      _id: 'model-1',
      category: ModelCategory.IMAGE,
      cost: 25,
      isActive: true,
      isDeleted: false,
      key: 'google/imagen-4',
      label: 'Imagen 4',
      provider: ModelProvider.REPLICATE,
    },
    {
      _id: 'model-2',
      category: ModelCategory.VIDEO,
      cost: 100,
      isActive: true,
      isDeleted: false,
      key: 'google/veo-3',
      label: 'Veo 3',
      provider: ModelProvider.REPLICATE,
    },
  ] as unknown as ModelDocument[];

  // Store original fetch
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronModelWatcherService,
        {
          provide: ModelsService,
          useValue: {
            find: vi.fn().mockResolvedValue(mockExistingModels),
            findAll: vi.fn(),
            findAllActive: vi.fn().mockResolvedValue(mockExistingModels),
          },
        },
        {
          provide: ModelDiscoveryService,
          useValue: {
            createDraftModel: vi.fn(),
            detectCategory: vi.fn().mockReturnValue(ModelCategory.IMAGE),
            fetchReplicateSchema: vi.fn(),
          },
        },
        {
          provide: ModelPricingService,
          useValue: {
            estimateFromProviderCost: vi.fn(),
            getKnownReplicateCost: vi.fn().mockReturnValue(null),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('test-replicate-token'),
          },
        },
        {
          provide: FalDiscoveryService,
          useValue: {
            discoverModels: vi.fn().mockResolvedValue([]),
            getModelPricing: vi.fn().mockResolvedValue(0),
            isConfigured: vi.fn().mockReturnValue(false),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            sendModelDiscoveryNotification: vi
              .fn()
              .mockResolvedValue(undefined),
            sendNotification: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CronModelWatcherService>(CronModelWatcherService);
    modelsService = module.get(ModelsService);
    modelDiscoveryService = module.get(ModelDiscoveryService);
    modelPricingService = module.get(ModelPricingService);
    configService = module.get(ConfigService);
    falDiscoveryService = module.get(FalDiscoveryService);
    notificationsService = module.get(NotificationsService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('discoverNewModels', () => {
    it('should discover new models not in DB', async () => {
      // Mock Replicate API returning a new model from a verified owner
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            next: null,
            results: [
              {
                description: 'A new image model',
                latest_version: {
                  id: 'version-123',
                  openapi_schema: {},
                },
                name: 'imagen-5',
                owner: 'google',
                url: 'https://replicate.com/google/imagen-5',
              },
              // Existing model that should be skipped
              {
                description: 'Existing model',
                latest_version: { id: 'v-existing', openapi_schema: {} },
                name: 'imagen-4',
                owner: 'google',
                url: 'https://replicate.com/google/imagen-4',
              },
            ],
          }),
        ok: true,
      } as Response);

      modelDiscoveryService.createDraftModel.mockResolvedValueOnce({
        _id: 'new-draft-id',
        key: 'google/imagen-5',
      } as unknown as ModelDocument);

      const result = await service.discoverNewModels();

      expect(result.newModelsFound).toBe(1);
      expect(result.draftsCreated).toBe(1);
      expect(result.errors).toBe(0);

      expect(modelDiscoveryService.createDraftModel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'imagen-5',
          owner: 'google',
          provider: ModelProvider.REPLICATE,
        }),
      );
    });

    it('should ignore models already in DB', async () => {
      // Mock Replicate API returning only existing models
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            next: null,
            results: [
              {
                description: 'Existing model',
                latest_version: { id: 'v1', openapi_schema: {} },
                name: 'imagen-4',
                owner: 'google',
                url: 'https://replicate.com/google/imagen-4',
              },
              {
                description: 'Another existing model',
                latest_version: { id: 'v2', openapi_schema: {} },
                name: 'veo-3',
                owner: 'google',
                url: 'https://replicate.com/google/veo-3',
              },
            ],
          }),
        ok: true,
      } as Response);

      const result = await service.discoverNewModels();

      expect(result.newModelsFound).toBe(0);
      expect(result.draftsCreated).toBe(0);
      expect(modelDiscoveryService.createDraftModel).not.toHaveBeenCalled();
    });

    it('should create draft entry with isActive false', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            next: null,
            results: [
              {
                description: 'Brand new model',
                latest_version: {
                  id: 'v-new',
                  openapi_schema: {},
                },
                name: 'flux-3-pro',
                owner: 'black-forest-labs',
                url: 'https://replicate.com/black-forest-labs/flux-3-pro',
              },
            ],
          }),
        ok: true,
      } as Response);

      modelDiscoveryService.createDraftModel.mockResolvedValueOnce({
        _id: 'draft-id',
        isActive: false,
        key: 'black-forest-labs/flux-3-pro',
      } as unknown as ModelDocument);

      await service.discoverNewModels();

      expect(modelDiscoveryService.createDraftModel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'flux-3-pro',
          owner: 'black-forest-labs',
          provider: ModelProvider.REPLICATE,
        }),
      );
    });

    it('should handle API errors gracefully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      const result = await service.discoverNewModels();

      expect(result.totalPolled).toBe(0);
      expect(result.newModelsFound).toBe(0);
      expect(result.errors).toBe(0);
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Replicate API returned 500'),
      );
    });

    it('should skip models from non-verified owners', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            next: null,
            results: [
              {
                description: 'Community model',
                latest_version: { id: 'v1', openapi_schema: {} },
                name: 'my-cool-model',
                owner: 'random-user-123',
                url: 'https://replicate.com/random-user-123/my-cool-model',
              },
            ],
          }),
        ok: true,
      } as Response);

      const result = await service.discoverNewModels();

      expect(result.newModelsFound).toBe(0);
      expect(modelDiscoveryService.createDraftModel).not.toHaveBeenCalled();
    });

    it('should handle missing REPLICATE_KEY', async () => {
      configService.get.mockReturnValue(undefined as unknown as string);

      const result = await service.discoverNewModels();

      expect(result.totalPolled).toBe(0);
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('REPLICATE_KEY not configured'),
      );
    });

    it('should handle pagination across multiple pages', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              next: 'https://api.replicate.com/v1/models?cursor=page2',
              results: [
                {
                  description: 'Page 1 model',
                  latest_version: { id: 'v1', openapi_schema: {} },
                  name: 'new-model-1',
                  owner: 'google',
                  url: 'https://replicate.com/google/new-model-1',
                },
              ],
            }),
          ok: true,
        } as Response)
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              next: null,
              results: [
                {
                  description: 'Page 2 model',
                  latest_version: { id: 'v2', openapi_schema: {} },
                  name: 'new-model-2',
                  owner: 'meta',
                  url: 'https://replicate.com/meta/new-model-2',
                },
              ],
            }),
          ok: true,
        } as Response);

      modelDiscoveryService.createDraftModel.mockResolvedValue({
        _id: 'draft',
      } as unknown as ModelDocument);

      const result = await service.discoverNewModels();

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(result.totalPolled).toBe(2);
      expect(result.newModelsFound).toBe(2);
    });

    it('should handle individual model processing errors without failing entire run', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            next: null,
            results: [
              {
                description: 'Failing model',
                latest_version: { id: 'v1', openapi_schema: {} },
                name: 'failing-model',
                owner: 'google',
                url: 'https://replicate.com/google/failing-model',
              },
              {
                description: 'Working model',
                latest_version: { id: 'v2', openapi_schema: {} },
                name: 'working-model',
                owner: 'meta',
                url: 'https://replicate.com/meta/working-model',
              },
            ],
          }),
        ok: true,
      } as Response);

      modelDiscoveryService.createDraftModel
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({
          _id: 'draft',
        } as unknown as ModelDocument);

      const result = await service.discoverNewModels();

      expect(result.newModelsFound).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.draftsCreated).toBe(1);
    });
  });

  describe('fal.ai polling', () => {
    /**
     * Helper: mock Replicate API to return one new model so the
     * watcher proceeds past the early return and reaches pollFalModels.
     */
    function mockReplicateWithNewModel(): void {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            next: null,
            results: [
              {
                description: 'Replicate model for fal test',
                latest_version: { id: 'v-rep', openapi_schema: {} },
                name: 'rep-model',
                owner: 'google',
                url: 'https://replicate.com/google/rep-model',
              },
            ],
          }),
        ok: true,
      } as Response);

      modelDiscoveryService.createDraftModel.mockResolvedValue({
        _id: 'draft-rep',
        cost: 25,
        key: 'google/rep-model',
      } as unknown as ModelDocument);
    }

    it('should discover new fal.ai models not in DB', async () => {
      mockReplicateWithNewModel();

      falDiscoveryService.isConfigured.mockReturnValue(true);
      falDiscoveryService.discoverModels.mockResolvedValueOnce([
        {
          category: ModelCategory.IMAGE,
          cost: 10,
          costPerUnit: 0.03,
          description: 'A new fal model',
          key: 'fal-ai/new-model',
          label: 'New Model',
          provider: ModelProvider.FAL,
        },
      ]);
      falDiscoveryService.getModelPricing.mockResolvedValueOnce(50);

      const result = await service.discoverNewModels();

      expect(result.falNewFound).toBe(1);
      expect(result.falDraftsCreated).toBe(1);

      // Verify createDraftModel was called with fal provider
      expect(modelDiscoveryService.createDraftModel).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: ModelProvider.FAL,
        }),
      );
    });

    it('should skip fal.ai polling when FAL_API_KEY not configured', async () => {
      mockReplicateWithNewModel();

      falDiscoveryService.isConfigured.mockReturnValue(false);

      await service.discoverNewModels();

      expect(falDiscoveryService.discoverModels).not.toHaveBeenCalled();
    });

    it('should handle fal.ai API errors without failing Replicate polling', async () => {
      mockReplicateWithNewModel();

      falDiscoveryService.isConfigured.mockReturnValue(true);
      falDiscoveryService.discoverModels.mockRejectedValueOnce(
        new Error('fal.ai API timeout'),
      );

      const result = await service.discoverNewModels();

      // Replicate polling should still have succeeded
      expect(result.totalPolled).toBe(1);
      expect(result.newModelsFound).toBe(1);
      expect(result.draftsCreated).toBe(1);
    });

    it('summary includes fal.ai-specific counts', async () => {
      mockReplicateWithNewModel();

      falDiscoveryService.isConfigured.mockReturnValue(true);
      falDiscoveryService.discoverModels.mockResolvedValueOnce([
        {
          category: ModelCategory.VIDEO,
          cost: 50,
          costPerUnit: 0.1,
          description: 'Fal video model',
          key: 'fal-ai/video-gen',
          label: 'Video Gen',
          provider: ModelProvider.FAL,
        },
      ]);
      falDiscoveryService.getModelPricing.mockResolvedValueOnce(80);

      modelDiscoveryService.createDraftModel.mockResolvedValue({
        _id: 'draft-fal',
        cost: 80,
        key: 'fal-ai/video-gen',
      } as unknown as ModelDocument);

      const result = await service.discoverNewModels();

      expect(result).toHaveProperty('falPolled');
      expect(result).toHaveProperty('falNewFound');
      expect(result).toHaveProperty('falDraftsCreated');
      expect(result.falPolled).toBe(1);
      expect(result.falNewFound).toBe(1);
      expect(result.falDraftsCreated).toBe(1);
    });
  });

  describe('Discord notifications', () => {
    /**
     * Helper: mock Replicate API to return a single new model from
     * a verified owner so the watcher enters the draft creation path.
     */
    function mockReplicateNewModelDiscovery(): void {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            next: null,
            results: [
              {
                description: 'New model for notification test',
                latest_version: { id: 'v-notif', openapi_schema: {} },
                name: 'notif-model',
                owner: 'meta',
                url: 'https://replicate.com/meta/notif-model',
              },
            ],
          }),
        ok: true,
      } as Response);
    }

    it('should send notification after draft creation', async () => {
      mockReplicateNewModelDiscovery();

      modelDiscoveryService.createDraftModel.mockResolvedValueOnce({
        _id: 'draft-notif',
        cost: 25,
        key: 'meta/notif-model',
      } as unknown as ModelDocument);

      await service.discoverNewModels();

      expect(
        notificationsService.sendModelDiscoveryNotification,
      ).toHaveBeenCalled();
    });

    it('should handle notification failure without failing watcher', async () => {
      mockReplicateNewModelDiscovery();

      modelDiscoveryService.createDraftModel.mockResolvedValueOnce({
        _id: 'draft-notif',
        cost: 25,
        key: 'meta/notif-model',
      } as unknown as ModelDocument);

      notificationsService.sendModelDiscoveryNotification.mockRejectedValueOnce(
        new Error('Discord webhook failed'),
      );

      const result = await service.discoverNewModels();

      // Watcher should still complete successfully
      expect(result.draftsCreated).toBe(1);
      expect(result.errors).toBe(0);
    });

    it('notification payload contains required fields', async () => {
      mockReplicateNewModelDiscovery();

      modelDiscoveryService.createDraftModel.mockResolvedValueOnce({
        _id: 'draft-notif',
        cost: 30,
        key: 'meta/notif-model',
      } as unknown as ModelDocument);

      await service.discoverNewModels();

      expect(
        notificationsService.sendModelDiscoveryNotification,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          category: expect.any(String),
          estimatedCost: expect.any(Number),
          modelKey: 'meta/notif-model',
          provider: 'replicate',
          providerCostUsd: expect.any(Number),
        }),
      );
    });
  });
});
