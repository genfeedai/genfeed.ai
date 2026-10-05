import { ModelsService } from '@api/collections/models/services/models.service';
import type { ServerModelRecord } from '@api/index';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import { CronFalModelWatcherService } from '@workers/crons/fal-model-watcher/cron.fal-model-watcher.service';
import { FalPlatformClient } from '@workers/crons/fal-model-watcher/fal-platform.client';
import type { IFalModel } from '@workers/interfaces/model-discovery.interface';
import { FalModelContractSyncService } from '@workers/services/fal-model-contract-sync.service';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';

describe('CronFalModelWatcherService', () => {
  let service: CronFalModelWatcherService;
  let modelsService: {
    prisma: { model: { findMany: ReturnType<typeof vi.fn> } };
  };
  let falContractSyncService: {
    recordFailure: ReturnType<typeof vi.fn>;
    synchronizeModel: ReturnType<typeof vi.fn>;
  };
  let falPlatformClient: {
    fetchModels: ReturnType<typeof vi.fn>;
    fetchPricing: ReturnType<typeof vi.fn>;
  };
  let modelDiscoveryService: vi.Mocked<ModelDiscoveryService>;
  let configService: vi.Mocked<ConfigService>;
  let loggerService: vi.Mocked<LoggerService>;
  let activityRecorder: { dispatch: ReturnType<typeof vi.fn> };

  /** An operator-approved, active fal row already in the registry. */
  const mockExistingModels = [
    {
      id: 'model-1',
      category: ModelCategory.IMAGE,
      cost: 25,
      isActive: true,
      isDeleted: false,
      endpoint: 'fal-ai/flux/dev',
      key: 'fal-ai/flux/dev',
      label: 'FLUX.1 [dev]',
      provider: ModelProvider.FAL,
    },
  ] as unknown as ServerModelRecord[];

  /** Mock one fully collected Fal model-search result. */
  function mockFalResponse(models: IFalModel[]): void {
    falPlatformClient.fetchModels.mockResolvedValueOnce(models);
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronFalModelWatcherService,
        {
          provide: ModelsService,
          useValue: {
            findAllActive: vi.fn().mockResolvedValue(mockExistingModels),
            prisma: {
              model: {
                findMany: vi.fn().mockResolvedValue(
                  mockExistingModels.map((model) => ({
                    endpoint: model.endpoint,
                    id: model.id,
                    isActive: model.isActive,
                    key: model.key,
                    provider: model.provider,
                    reviewedProviderContractVersion: null,
                  })),
                ),
              },
            },
          },
        },
        {
          provide: ModelDiscoveryService,
          useValue: {
            classifyCategory: vi.fn().mockResolvedValue({
              category: ModelCategory.IMAGE,
              source: 'keyword',
            }),
            createDraftModel: vi.fn(),
            touchLastSyncedAt: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('test-fal-key'),
          },
        },
        {
          provide: FalPlatformClient,
          useValue: {
            fetchModels: vi.fn(),
            fetchPricing: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: FalModelContractSyncService,
          useValue: {
            recordFailure: vi.fn().mockResolvedValue(undefined),
            synchronizeModel: vi.fn().mockResolvedValue({
              drifted: false,
              quarantined: false,
              version: 'sha256:candidate',
            }),
          },
        },
        {
          provide: ActivityRecorderService,
          useValue: {
            dispatch: vi.fn().mockResolvedValue(undefined),
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

    service = module.get<CronFalModelWatcherService>(
      CronFalModelWatcherService,
    );
    modelsService = module.get(
      ModelsService,
    ) as unknown as typeof modelsService;
    modelDiscoveryService = module.get(ModelDiscoveryService);
    falContractSyncService = module.get(
      FalModelContractSyncService,
    ) as unknown as typeof falContractSyncService;
    falPlatformClient = module.get(
      FalPlatformClient,
    ) as unknown as typeof falPlatformClient;
    configService = module.get(ConfigService);
    activityRecorder = module.get(ActivityRecorderService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('discoverNewModels', () => {
    it('creates a draft for a new fal endpoint', async () => {
      mockFalResponse([
        {
          endpoint_id: 'fal-ai/flux-2-pro',
          metadata: {
            category: 'text-to-image',
            description: 'Frontier text-to-image model',
            display_name: 'FLUX.2 [pro]',
            model_url: 'https://fal.ai/models/fal-ai/flux-2-pro',
            status: 'active',
          },
        },
      ]);
      modelDiscoveryService.createDraftModel.mockResolvedValueOnce({
        id: 'draft-id',
        key: 'fal-ai/flux-2-pro',
      } as unknown as ServerModelRecord);

      const result = await service.discoverNewModels();

      expect(result.newModelsFound).toBe(1);
      expect(result.draftsCreated).toBe(1);
      expect(result.errors).toBe(0);
      expect(modelDiscoveryService.createDraftModel).toHaveBeenCalledWith({
        category: ModelCategory.IMAGE,
        description: 'Frontier text-to-image model',
        endpoint: 'fal-ai/flux-2-pro',
        label: 'FLUX.2 [pro]',
        name: 'flux-2-pro',
        owner: 'fal-ai',
        provider: ModelProvider.FAL,
        providerUrl: 'https://fal.ai/models/fal-ai/flux-2-pro',
        versionId: null,
      });
    });

    it('keeps the nested endpoint path in the registry key', async () => {
      mockFalResponse([
        {
          endpoint_id: 'fal-ai/kling-video/v3/pro',
          metadata: { category: 'image-to-video', status: 'active' },
        },
      ]);
      modelDiscoveryService.createDraftModel.mockResolvedValueOnce({
        id: 'draft-id',
      } as unknown as ServerModelRecord);

      await service.discoverNewModels();

      expect(modelDiscoveryService.createDraftModel).toHaveBeenCalledWith(
        expect.objectContaining({
          category: ModelCategory.VIDEO,
          name: 'kling-video/v3/pro',
          owner: 'fal-ai',
        }),
      );
    });

    it('never re-creates an operator-approved model already in the registry', async () => {
      mockFalResponse([
        {
          endpoint_id: 'fal-ai/flux/dev',
          metadata: { category: 'text-to-image', status: 'active' },
        },
      ]);

      const result = await service.discoverNewModels();

      expect(result.newModelsFound).toBe(0);
      expect(modelsService.prisma.model.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isDeleted: false, organizationId: null },
        }),
      );
      expect(modelDiscoveryService.createDraftModel).not.toHaveBeenCalled();
      expect(falContractSyncService.synchronizeModel).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'fal-ai/flux/dev' }),
        expect.objectContaining({ endpoint_id: 'fal-ai/flux/dev' }),
        [],
        expect.any(Date),
      );
    });

    it('alerts ops Discord about a fal price change and a failed refresh', async () => {
      mockFalResponse([
        {
          endpoint_id: 'fal-ai/flux/dev',
          metadata: { category: 'text-to-image', status: 'active' },
        },
      ]);
      falContractSyncService.synchronizeModel.mockResolvedValueOnce({
        drifted: true,
        priceChange: {
          changes: [
            {
              component: 'output',
              newPriceUsd: 0.03,
              oldPriceUsd: 0.025,
              unit: 'output',
              variant: 'all variants',
            },
          ],
          modelKey: 'fal-ai/flux/dev',
          pendingRateHash: 'rates:sha256:fal',
          provider: 'fal',
          sourceUrl: 'https://api.fal.ai/v1/models/pricing',
        },
        quarantined: false,
        refreshFailure: {
          modelKey: 'fal-ai/flux/dev',
          provider: 'fal',
          reason: 'rates_unavailable:missing_pricing',
        },
        version: 'sha256:candidate',
      });

      await service.discoverNewModels();

      expect(activityRecorder.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          deduplicationKey:
            'message.model-price-change/fal-ai/flux/dev/rates:sha256:fal',
        }),
      );
      expect(activityRecorder.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          deduplicationKey: expect.stringContaining(
            'message.model-pricing-unavailable/fal-ai/flux/dev/',
          ),
        }),
      );
    });

    it('alerts ops when a Fal sync throws', async () => {
      mockFalResponse([
        {
          endpoint_id: 'fal-ai/flux/dev',
          metadata: { category: 'text-to-image', status: 'active' },
        },
      ]);
      falContractSyncService.synchronizeModel.mockRejectedValueOnce(
        new Error('boom'),
      );

      const result = await service.discoverNewModels();

      expect(result.errors).toBe(1);
      expect(activityRecorder.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          deduplicationKey: expect.stringContaining(
            'message.model-pricing-unavailable/fal-ai/flux/dev/The fal price refresh failed (contract_sync_failed)',
          ),
        }),
      );
    });

    it('discovers Fal partner namespaces with collision-safe keys', async () => {
      mockFalResponse([
        {
          endpoint_id: 'google/nano-banana-2-lite',
          metadata: { category: 'text-to-image', status: 'active' },
        },
        {
          endpoint_id: 'minimax/h3/text-to-video',
          metadata: { category: 'text-to-video', status: 'active' },
        },
      ]);
      modelDiscoveryService.createDraftModel.mockResolvedValue({
        id: 'draft-id',
      } as unknown as ServerModelRecord);

      const result = await service.discoverNewModels();

      expect(result.totalPolled).toBe(2);
      expect(result.newModelsFound).toBe(2);
      expect(modelDiscoveryService.createDraftModel).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'google/nano-banana-2-lite',
          provider: ModelProvider.FAL,
        }),
      );
      expect(modelDiscoveryService.createDraftModel).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'minimax/h3/text-to-video',
          provider: ModelProvider.FAL,
        }),
      );
    });

    it('does not let a Replicate row suppress a colliding Fal endpoint', async () => {
      modelsService.prisma.model.findMany.mockResolvedValueOnce([
        {
          endpoint: 'google/nano-banana-2-lite',
          key: 'google/nano-banana-2-lite',
          provider: ModelProvider.REPLICATE,
        },
      ]);
      mockFalResponse([
        {
          endpoint_id: 'google/nano-banana-2-lite',
          metadata: { category: 'text-to-image', status: 'active' },
        },
      ]);
      modelDiscoveryService.createDraftModel.mockResolvedValueOnce({
        id: 'fal-draft',
        key: 'fal/google/nano-banana-2-lite',
      } as unknown as ServerModelRecord);

      const result = await service.discoverNewModels();

      expect(result.newModelsFound).toBe(1);
      expect(modelDiscoveryService.createDraftModel).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'google/nano-banana-2-lite',
          provider: ModelProvider.FAL,
        }),
      );
    });

    it('skips endpoints fal marks deprecated', async () => {
      mockFalResponse([
        {
          endpoint_id: 'fal-ai/legacy-model',
          metadata: { category: 'text-to-image', status: 'deprecated' },
        },
      ]);

      const result = await service.discoverNewModels();

      expect(result.newModelsFound).toBe(0);
      expect(modelDiscoveryService.createDraftModel).not.toHaveBeenCalled();
    });

    it('soft-fails when FAL_API_KEY is not configured', async () => {
      configService.get.mockReturnValue(undefined as unknown as string);

      const result = await service.discoverNewModels();

      expect(falPlatformClient.fetchModels).not.toHaveBeenCalled();
      expect(result.totalPolled).toBe(0);
      expect(result.draftsCreated).toBe(0);
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('FAL_API_KEY not configured'),
      );
    });

    it('requests pricing for every endpoint collected by the paginated client', async () => {
      mockFalResponse([
        {
          endpoint_id: 'fal-ai/page-one',
          metadata: { category: 'text-to-image' },
        },
        {
          endpoint_id: 'fal-ai/page-two',
          metadata: { category: 'text-to-video' },
        },
      ]);
      modelDiscoveryService.createDraftModel.mockResolvedValue({
        id: 'draft',
      } as unknown as ServerModelRecord);

      const result = await service.discoverNewModels();

      expect(falPlatformClient.fetchPricing).toHaveBeenCalledWith([
        'fal-ai/page-one',
        'fal-ai/page-two',
      ]);
      expect(result.totalPolled).toBe(2);
      expect(result.newModelsFound).toBe(2);
    });

    it('handles API errors gracefully', async () => {
      falPlatformClient.fetchModels.mockRejectedValueOnce(
        new Error('Fal platform request failed after 3 attempts (500)'),
      );

      const result = await service.discoverNewModels();

      expect(result.totalPolled).toBe(0);
      expect(result.errors).toBe(1);
      expect(falContractSyncService.recordFailure).toHaveBeenCalledWith(
        'fal_sync_failed',
        expect.any(Date),
      );
    });

    it('keeps processing after a single model fails', async () => {
      mockFalResponse([
        {
          endpoint_id: 'fal-ai/failing-model',
          metadata: { category: 'text-to-image' },
        },
        {
          endpoint_id: 'fal-ai/working-model',
          metadata: { category: 'text-to-image' },
        },
      ]);
      modelDiscoveryService.createDraftModel
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ id: 'draft' } as unknown as ServerModelRecord);

      const result = await service.discoverNewModels();

      expect(result.newModelsFound).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.draftsCreated).toBe(1);
    });

    it('falls back to the shared classification for unmapped categories', async () => {
      mockFalResponse([
        {
          endpoint_id: 'fal-ai/mystery-model',
          metadata: { category: 'unknown-task', description: 'Does things' },
        },
      ]);
      modelDiscoveryService.classifyCategory.mockResolvedValue({
        category: ModelCategory.VOICE,
        confidence: 0.42,
        source: 'typed-decision',
      });
      modelDiscoveryService.createDraftModel.mockResolvedValueOnce({
        id: 'draft',
      } as unknown as ServerModelRecord);

      await service.discoverNewModels();

      expect(modelDiscoveryService.classifyCategory).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Does things',
          endpoint: 'fal-ai/mystery-model',
          tags: expect.arrayContaining(['unknown-task']),
        }),
      );
      expect(modelDiscoveryService.createDraftModel).toHaveBeenCalledWith(
        expect.objectContaining({
          category: ModelCategory.VOICE,
          categoryConfidence: 0.42,
        }),
      );
    });

    it('never classifies an endpoint whose fal task category is mapped', async () => {
      mockFalResponse([
        {
          endpoint_id: 'fal-ai/mapped-model',
          metadata: { category: 'text-to-video', description: 'Does things' },
        },
      ]);
      modelDiscoveryService.createDraftModel.mockResolvedValueOnce({
        id: 'draft',
      } as unknown as ServerModelRecord);

      await service.discoverNewModels();

      expect(modelDiscoveryService.classifyCategory).not.toHaveBeenCalled();
      expect(modelDiscoveryService.createDraftModel).toHaveBeenCalledWith(
        expect.objectContaining({ category: ModelCategory.VIDEO }),
      );
      expect(
        modelDiscoveryService.createDraftModel.mock.calls[0][0],
      ).not.toHaveProperty('categoryConfidence');
    });
  });

  describe('Discord notifications', () => {
    beforeEach(() => {
      mockFalResponse([
        {
          endpoint_id: 'fal-ai/notif-model',
          metadata: { category: 'text-to-image' },
        },
      ]);
      modelDiscoveryService.createDraftModel.mockResolvedValueOnce({
        cost: 30,
        id: 'draft-notif',
      } as unknown as ServerModelRecord);
    });

    it('notification payload contains required fields', async () => {
      await service.discoverNewModels();

      expect(activityRecorder.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              message: expect.objectContaining({
                action: 'model_discovery',
                payload: expect.objectContaining({
                  category: ModelCategory.IMAGE,
                  estimatedCost: 30,
                  modelKey: 'fal-ai/notif-model',
                  provider: ModelProvider.FAL,
                  providerCostUsd: 0,
                }),
              }),
            }),
          ],
        }),
      );
    });

    it('handles notification failure without failing the watcher', async () => {
      activityRecorder.dispatch.mockRejectedValueOnce(
        new Error('Discord webhook failed'),
      );

      const result = await service.discoverNewModels();

      expect(result.draftsCreated).toBe(1);
      expect(result.errors).toBe(0);
    });
  });
});
