import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import type { ServerModelRecord } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ModelsService } from '@server/collections/models/services/models.service';
import { NotificationsService } from '@server/services/notifications/notifications.service';
import { ConfigService } from '@workers/config/config.service';
import { CronModelWatcherService } from '@workers/crons/model-watcher/cron.model-watcher.service';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';
import { ModelPricingService } from '@workers/services/model-pricing.service';
import { PlatformMarginService } from '@workers/services/platform-margin.service';
import { ReplicateModelContractSyncService } from '@workers/services/replicate-model-contract-sync.service';

describe('CronModelWatcherService', () => {
  let service: CronModelWatcherService;
  let modelDiscoveryService: vi.Mocked<ModelDiscoveryService>;
  let configService: vi.Mocked<ConfigService>;
  let loggerService: vi.Mocked<LoggerService>;
  let notificationsService: vi.Mocked<NotificationsService>;
  let replicateContractSyncService: vi.Mocked<ReplicateModelContractSyncService>;

  const mockExistingModels = [
    {
      id: 'model-1',
      category: ModelCategory.IMAGE,
      cost: 25,
      endpoint: 'google/imagen-4',
      isActive: true,
      isDeleted: false,
      key: 'google/imagen-4',
      label: 'Imagen 4',
      pricingType: 'per-request',
      provider: ModelProvider.REPLICATE,
      providerCostUsd: 0.04,
    },
    {
      id: 'model-2',
      category: ModelCategory.VIDEO,
      cost: 100,
      endpoint: 'google/veo-3',
      isActive: true,
      isDeleted: false,
      key: 'google/veo-3',
      label: 'Veo 3',
      pricingType: 'per-second',
      provider: ModelProvider.REPLICATE,
      providerCostUsd: 0.5,
    },
  ] as unknown as ServerModelRecord[];

  // Store original fetch
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronModelWatcherService,
        {
          provide: ModelsService,
          useValue: {
            prisma: {
              model: {
                findMany: vi.fn().mockResolvedValue(mockExistingModels),
              },
            },
          },
        },
        {
          provide: ModelDiscoveryService,
          useValue: {
            createDraftModel: vi.fn(),
            detectCategory: vi.fn().mockReturnValue(ModelCategory.IMAGE),
            fetchReplicateModel: vi
              .fn()
              .mockImplementation((owner: string, name: string) =>
                Promise.resolve({
                  description: 'Existing model',
                  latest_version: {
                    cog_version: 'cog-v1',
                    created_at: '2026-08-01T00:00:00.000Z',
                    id: `version-${name}`,
                    openapi_schema: {
                      components: {
                        schemas: {
                          Input: {
                            properties: { prompt: { type: 'string' } },
                            type: 'object',
                          },
                          Output: { type: 'string' },
                        },
                      },
                    },
                  },
                  name,
                  owner,
                  url: `https://replicate.com/${owner}/${name}`,
                }),
              ),
            fetchReplicateSchema: vi.fn(),
            touchLastSyncedAt: vi.fn().mockResolvedValue(undefined),
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
          provide: NotificationsService,
          useValue: {
            sendModelDiscoveryNotification: vi
              .fn()
              .mockResolvedValue(undefined),
            sendNotification: vi.fn(),
          },
        },
        {
          provide: PlatformMarginService,
          useValue: {
            hydrate: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ReplicateModelContractSyncService,
          useValue: {
            recordFailure: vi.fn().mockResolvedValue(undefined),
            synchronizeModel: vi.fn().mockResolvedValue({
              drifted: false,
              quarantined: false,
              version: 'sha256:current',
            }),
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
    modelDiscoveryService = module.get(ModelDiscoveryService);
    configService = module.get(ConfigService);
    notificationsService = module.get(NotificationsService);
    replicateContractSyncService = module.get(
      ReplicateModelContractSyncService,
    );
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
      } as unknown as ServerModelRecord);

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

    it('records schema and pricing drift as a pending provider contract', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ next: null, results: [] }),
        ok: true,
      } as Response);
      replicateContractSyncService.synchronizeModel.mockResolvedValueOnce({
        drifted: true,
        quarantined: false,
        version: 'sha256:changed',
      });

      const result = await service.discoverNewModels();

      expect(replicateContractSyncService.synchronizeModel).toHaveBeenCalled();
      expect(result.providerContractsDrifted).toBe(1);
      expect(result.providerContractsSynchronized).toBe(2);
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
      } as unknown as ServerModelRecord);

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
      } as unknown as ServerModelRecord);

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
        } as unknown as ServerModelRecord);

      const result = await service.discoverNewModels();

      expect(result.newModelsFound).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.draftsCreated).toBe(1);
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
      } as unknown as ServerModelRecord);

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
      } as unknown as ServerModelRecord);

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
      } as unknown as ServerModelRecord);

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
