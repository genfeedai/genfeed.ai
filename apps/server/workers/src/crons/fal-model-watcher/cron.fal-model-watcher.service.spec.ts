import { ModelsService } from '@api/collections/models/services/models.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import type { ServerModelRecord } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import { CronFalModelWatcherService } from '@workers/crons/fal-model-watcher/cron.fal-model-watcher.service';
import type { IFalModel } from '@workers/interfaces/model-discovery.interface';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';

describe('CronFalModelWatcherService', () => {
  let service: CronFalModelWatcherService;
  let modelDiscoveryService: vi.Mocked<ModelDiscoveryService>;
  let configService: vi.Mocked<ConfigService>;
  let loggerService: vi.Mocked<LoggerService>;
  let notificationsService: vi.Mocked<NotificationsService>;

  /** An operator-approved, active fal row already in the registry. */
  const mockExistingModels = [
    {
      id: 'model-1',
      category: ModelCategory.IMAGE,
      cost: 25,
      isActive: true,
      isDeleted: false,
      key: 'fal-ai/flux/dev',
      label: 'FLUX.1 [dev]',
      provider: ModelProvider.FAL,
    },
  ] as unknown as ServerModelRecord[];

  const originalFetch = globalThis.fetch;

  /** Mock a single-page fal model search response. */
  function mockFalResponse(models: IFalModel[]): void {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          has_more: false,
          models,
          next_cursor: null,
        }),
      ok: true,
    } as Response);
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
                findMany: vi
                  .fn()
                  .mockResolvedValue(
                    mockExistingModels.map((model) => ({ key: model.key })),
                  ),
              },
            },
          },
        },
        {
          provide: ModelDiscoveryService,
          useValue: {
            createDraftModel: vi.fn(),
            detectCategory: vi.fn().mockReturnValue(ModelCategory.IMAGE),
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

    service = module.get<CronFalModelWatcherService>(
      CronFalModelWatcherService,
    );
    modelDiscoveryService = module.get(ModelDiscoveryService);
    configService = module.get(ConfigService);
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
      expect(modelDiscoveryService.createDraftModel).not.toHaveBeenCalled();
      // Freshness tracking only touches rows flagged isDiscovered.
      expect(modelDiscoveryService.touchLastSyncedAt).toHaveBeenCalledWith([
        'fal-ai/flux/dev',
      ]);
    });

    it('skips namespaces that would route to another provider', async () => {
      mockFalResponse([
        {
          endpoint_id: 'google/veo3',
          metadata: { category: 'text-to-video', status: 'active' },
        },
        {
          endpoint_id: 'openai/gpt-image-1',
          metadata: { category: 'text-to-image', status: 'active' },
        },
      ]);

      const result = await service.discoverNewModels();

      expect(result.totalPolled).toBe(2);
      expect(result.newModelsFound).toBe(0);
      expect(modelDiscoveryService.createDraftModel).not.toHaveBeenCalled();
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
      globalThis.fetch = vi.fn();

      const result = await service.discoverNewModels();

      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(result.totalPolled).toBe(0);
      expect(result.draftsCreated).toBe(0);
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('FAL_API_KEY not configured'),
      );
    });

    it('follows the cursor across pages', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              has_more: true,
              models: [
                {
                  endpoint_id: 'fal-ai/page-one',
                  metadata: { category: 'text-to-image' },
                },
              ],
              next_cursor: 'cursor-2',
            }),
          ok: true,
        } as Response)
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              has_more: false,
              models: [
                {
                  endpoint_id: 'fal-ai/page-two',
                  metadata: { category: 'text-to-video' },
                },
              ],
              next_cursor: null,
            }),
          ok: true,
        } as Response);
      modelDiscoveryService.createDraftModel.mockResolvedValue({
        id: 'draft',
      } as unknown as ServerModelRecord);

      const result = await service.discoverNewModels();

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(result.totalPolled).toBe(2);
      expect(result.newModelsFound).toBe(2);
    });

    it('handles API errors gracefully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      const result = await service.discoverNewModels();

      expect(result.totalPolled).toBe(0);
      expect(result.errors).toBe(0);
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('fal API returned 500'),
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

    it('falls back to description detection for unmapped categories', async () => {
      mockFalResponse([
        {
          endpoint_id: 'fal-ai/mystery-model',
          metadata: { category: 'unknown-task', description: 'Does things' },
        },
      ]);
      modelDiscoveryService.detectCategory.mockReturnValue(ModelCategory.VOICE);
      modelDiscoveryService.createDraftModel.mockResolvedValueOnce({
        id: 'draft',
      } as unknown as ServerModelRecord);

      await service.discoverNewModels();

      expect(modelDiscoveryService.detectCategory).toHaveBeenCalledWith(
        {},
        expect.stringContaining('unknown-task'),
      );
      expect(modelDiscoveryService.createDraftModel).toHaveBeenCalledWith(
        expect.objectContaining({ category: ModelCategory.VOICE }),
      );
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

      expect(
        notificationsService.sendModelDiscoveryNotification,
      ).toHaveBeenCalledWith({
        category: ModelCategory.IMAGE,
        estimatedCost: 30,
        modelKey: 'fal-ai/notif-model',
        provider: ModelProvider.FAL,
        providerCostUsd: 0,
      });
    });

    it('handles notification failure without failing the watcher', async () => {
      notificationsService.sendModelDiscoveryNotification.mockRejectedValueOnce(
        new Error('Discord webhook failed'),
      );

      const result = await service.discoverNewModels();

      expect(result.draftsCreated).toBe(1);
      expect(result.errors).toBe(0);
    });
  });
});
