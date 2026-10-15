import { ModelsService } from '@api/collections/models/services/models.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { ModelProvider } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import { CronFalModelWatcherService } from '@workers/crons/fal-model-watcher/cron.fal-model-watcher.service';
import { FalPlatformClient } from '@workers/crons/fal-model-watcher/fal-platform.client';
import type { IFalModel } from '@workers/interfaces/model-discovery.interface';
import { FalModelContractSyncService } from '@workers/services/fal-model-contract-sync.service';

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
  let configService: vi.Mocked<ConfigService>;
  let loggerService: vi.Mocked<LoggerService>;
  let activityRecorder: { dispatch: ReturnType<typeof vi.fn> };

  /** Operator-approved fal rows already in the registry. */
  const registryRows = [
    {
      endpoint: 'fal-ai/flux/dev',
      id: 'model-1',
      isActive: true,
      isFree: false,
      key: 'fal-ai/flux/dev',
      provider: ModelProvider.FAL,
      reviewedProviderContractVersion: null,
    },
    {
      endpoint: 'minimax/h3-max/text-to-video',
      id: 'model-2',
      isActive: true,
      isFree: false,
      key: 'fal/minimax/h3-max/text-to-video',
      provider: ModelProvider.FAL,
      reviewedProviderContractVersion: null,
    },
  ];

  const falModel = (endpoint: string, status = 'active'): IFalModel => ({
    endpoint_id: endpoint,
    metadata: { category: 'text-to-video', status },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronFalModelWatcherService,
        {
          provide: ModelsService,
          useValue: {
            prisma: {
              model: { findMany: vi.fn().mockResolvedValue(registryRows) },
            },
          },
        },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('test-fal-key') },
        },
        {
          provide: FalPlatformClient,
          useValue: {
            fetchModels: vi.fn().mockResolvedValue([]),
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
          useValue: { dispatch: vi.fn().mockResolvedValue(undefined) },
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

    service = module.get(CronFalModelWatcherService);
    modelsService = module.get(
      ModelsService,
    ) as unknown as typeof modelsService;
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

  describe('refreshRegistryModels', () => {
    it('requests only the platform fal endpoints already in the registry', async () => {
      falPlatformClient.fetchModels.mockResolvedValueOnce([
        falModel('fal-ai/flux/dev'),
        falModel('minimax/h3-max/text-to-video'),
      ]);

      const result = await service.refreshRegistryModels();

      expect(modelsService.prisma.model.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isDeleted: false,
            organizationId: null,
            provider: ModelProvider.FAL,
          },
        }),
      );
      expect(falPlatformClient.fetchModels).toHaveBeenCalledWith([
        'fal-ai/flux/dev',
        'minimax/h3-max/text-to-video',
      ]);
      expect(falPlatformClient.fetchPricing).toHaveBeenCalledWith([
        'fal-ai/flux/dev',
        'minimax/h3-max/text-to-video',
      ]);
      expect(falContractSyncService.synchronizeModel).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'model-2' }),
        expect.objectContaining({
          endpoint_id: 'minimax/h3-max/text-to-video',
        }),
        [],
        expect.any(Date),
      );
      expect(result).toMatchObject({
        draftsCreated: 0,
        errors: 0,
        newModelsFound: 0,
        providerContractsSynchronized: 2,
        totalPolled: 2,
      });
    });

    it('passes each endpoint its own observed prices', async () => {
      falPlatformClient.fetchModels.mockResolvedValueOnce([
        falModel('fal-ai/flux/dev'),
      ]);
      const price = {
        currency: 'USD',
        endpoint_id: 'fal-ai/flux/dev',
        unit: 'image',
        unit_price: 0.025,
      };
      falPlatformClient.fetchPricing.mockResolvedValueOnce([price]);

      await service.refreshRegistryModels();

      expect(falContractSyncService.synchronizeModel).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'model-1' }),
        expect.objectContaining({ endpoint_id: 'fal-ai/flux/dev' }),
        [price],
        expect.any(Date),
      );
    });

    it('records a fetch failure for a registry endpoint fal did not return', async () => {
      falPlatformClient.fetchModels.mockResolvedValueOnce([
        falModel('fal-ai/flux/dev'),
      ]);

      const result = await service.refreshRegistryModels();

      expect(result.errors).toBe(1);
      expect(falContractSyncService.recordFailure).toHaveBeenCalledWith(
        'model_fetch_failed',
        expect.any(Date),
        'model-2',
      );
      expect(activityRecorder.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          deduplicationKey: expect.stringContaining(
            'message.model-pricing-unavailable/minimax/h3-max/text-to-video/The fal price refresh failed (model_fetch_failed)',
          ),
        }),
      );
    });

    it('treats an endpoint fal marks deprecated as not refreshed', async () => {
      falPlatformClient.fetchModels.mockResolvedValueOnce([
        falModel('fal-ai/flux/dev', 'deprecated'),
        falModel('minimax/h3-max/text-to-video'),
      ]);

      await service.refreshRegistryModels();

      expect(falContractSyncService.synchronizeModel).toHaveBeenCalledTimes(1);
      expect(falContractSyncService.recordFailure).toHaveBeenCalledWith(
        'model_fetch_failed',
        expect.any(Date),
        'model-1',
      );
    });

    it('does not call fal when the registry has no fal endpoints', async () => {
      modelsService.prisma.model.findMany.mockResolvedValueOnce([]);

      const result = await service.refreshRegistryModels();

      expect(falPlatformClient.fetchModels).not.toHaveBeenCalled();
      expect(result.errors).toBe(0);
    });

    it('alerts ops Discord about a fal price change and a failed refresh', async () => {
      falPlatformClient.fetchModels.mockResolvedValueOnce([
        falModel('fal-ai/flux/dev'),
        falModel('minimax/h3-max/text-to-video'),
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

      const result = await service.refreshRegistryModels();

      expect(result.providerContractsDrifted).toBe(1);
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

    it('keeps refreshing after one endpoint throws', async () => {
      falPlatformClient.fetchModels.mockResolvedValueOnce([
        falModel('fal-ai/flux/dev'),
        falModel('minimax/h3-max/text-to-video'),
      ]);
      falContractSyncService.synchronizeModel.mockRejectedValueOnce(
        new Error('boom'),
      );

      const result = await service.refreshRegistryModels();

      expect(result.errors).toBe(1);
      expect(result.providerContractsSynchronized).toBe(1);
      expect(falContractSyncService.recordFailure).toHaveBeenCalledWith(
        'contract_sync_failed',
        expect.any(Date),
        'model-1',
      );
    });

    it('soft-fails when FAL_API_KEY is not configured', async () => {
      configService.get.mockReturnValue(undefined as unknown as string);

      const result = await service.refreshRegistryModels();

      expect(falPlatformClient.fetchModels).not.toHaveBeenCalled();
      expect(result.totalPolled).toBe(0);
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('FAL_API_KEY not configured'),
      );
    });

    it('records one provider-wide failure when the fal request fails', async () => {
      falPlatformClient.fetchModels.mockRejectedValueOnce(
        new Error('Fal platform request failed after 3 attempts (400)'),
      );

      const result = await service.refreshRegistryModels();

      expect(result.errors).toBe(1);
      expect(falContractSyncService.recordFailure).toHaveBeenCalledWith(
        'fal_sync_failed',
        expect.any(Date),
      );
      expect(activityRecorder.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          deduplicationKey: expect.stringContaining(
            'message.model-pricing-unavailable/provider:fal/The fal price refresh failed (fal_sync_failed)',
          ),
          source: { id: 'provider:fal', type: 'model' },
        }),
      );
    });
  });
});
