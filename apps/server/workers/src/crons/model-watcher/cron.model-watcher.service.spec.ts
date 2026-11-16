import { ModelsService } from '@api/collections/models/services/models.service';
import type { ServerModelRecord } from '@api/index';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import {
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import { CronModelWatcherService } from '@workers/crons/model-watcher/cron.model-watcher.service';
import type { IReplicateModel } from '@workers/interfaces/model-discovery.interface';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';
import { PlatformMarginService } from '@workers/services/platform-margin.service';
import { ReplicateModelContractSyncService } from '@workers/services/replicate-model-contract-sync.service';
import type { Mocked } from 'vitest';
import {
  GEMINI_4_CARBON_TIERS,
  GROK_TEXT_TO_SPEECH_TIERS,
  MINIMAX_VIDEO_01_TIERS,
  QWEN3_7_PLUS_TIERS,
  RECRAFT_V3_SVG_TIERS,
  RECRAFT_V3_TIERS,
  RECRAFT_V4_PRO_SVG_TIERS,
  WAN_2_5_T2V_TIERS,
} from '../../../../../../packages/pricing/src/reviewed-rates/replicate-model-pages.fixture';

describe('CronModelWatcherService', () => {
  let service: CronModelWatcherService;
  let modelDiscoveryService: Mocked<ModelDiscoveryService>;
  let configService: Mocked<ConfigService>;
  let loggerService: Mocked<LoggerService>;
  let notificationsService: Mocked<ActivityRecorderService>;

  /** The scan cards handed to the outbox, one payload per message. */
  const sentScanCards = () =>
    notificationsService.dispatch.mock.calls.flatMap((call) =>
      call[0].messages.map((entry) => entry.message.payload),
    );
  let replicateContractSyncService: Mocked<ReplicateModelContractSyncService>;

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
            classifyCategory: vi.fn().mockResolvedValue({
              category: ModelCategory.IMAGE,
              source: 'keyword',
            }),
            createDraftModel: vi.fn(),
            fetchReplicateModel: vi
              .fn()
              .mockImplementation((owner: string, name: string) =>
                Promise.resolve({
                  model: {
                    description: 'Existing model',
                    is_official: true,
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
                  },
                  status: 'ok',
                }),
              ),
            fetchReplicateBilling: vi.fn().mockResolvedValue({
              reason: 'no_billing_config',
              status: 'unavailable',
            }),
            fetchReplicateSchema: vi.fn(),
            touchLastSyncedAt: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('test-replicate-token'),
          },
        },
        {
          provide: ActivityRecorderService,
          useValue: {
            dispatch: vi.fn().mockResolvedValue(undefined),
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
            recordProviderState: vi.fn().mockResolvedValue(true),
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
    notificationsService = module.get(ActivityRecorderService);
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
                is_official: true,
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
                is_official: true,
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
      // Nothing to record when the deterministic path answered (#4869).
      expect(
        modelDiscoveryService.createDraftModel.mock.calls[0][0],
      ).not.toHaveProperty('categoryConfidence');
    });

    it('carries the category confidence onto the draft when one was decided', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            next: null,
            results: [
              {
                is_official: true,
                description: 'A brand new model',
                latest_version: { id: 'v9', openapi_schema: {} },
                name: 'imagen-5',
                owner: 'google',
                url: 'https://replicate.com/google/imagen-5',
              },
            ],
          }),
        ok: true,
      } as Response);
      modelDiscoveryService.classifyCategory.mockResolvedValue({
        category: ModelCategory.VIDEO,
        confidence: 0.51,
        source: 'keyword',
      });
      modelDiscoveryService.createDraftModel.mockResolvedValueOnce({
        _id: 'new-draft-id',
        key: 'google/imagen-5',
      } as unknown as ServerModelRecord);

      await service.discoverNewModels();

      expect(modelDiscoveryService.classifyCategory).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'A brand new model',
          endpoint: 'google/imagen-5',
          provider: ModelProvider.REPLICATE,
        }),
      );
      expect(modelDiscoveryService.createDraftModel).toHaveBeenCalledWith(
        expect.objectContaining({
          category: ModelCategory.VIDEO,
          categoryConfidence: 0.51,
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

    it('posts one card for a price change and a refresh failure, with the rates the page stated', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ next: null, results: [] }),
        ok: true,
      } as Response);
      const priceChange = {
        changes: [
          {
            component: 'video_output_count',
            newPriceUsd: 0.21,
            oldPriceUsd: 0.19,
            unit: 'output' as const,
            variant: 'duration=6 · resolution=768P',
          },
        ],
        isUrgent: false,
        modelKey: 'google/imagen-4',
        pendingRateHash: 'rates:sha256:abc',
        provider: 'replicate',
        sourceUrl: 'https://replicate.com/google/imagen-4',
        urgentReason: null,
      };
      replicateContractSyncService.synchronizeModel.mockResolvedValueOnce({
        drifted: true,
        priceChange,
        quarantined: false,
        version: 'sha256:changed',
      });
      replicateContractSyncService.synchronizeModel.mockResolvedValueOnce({
        drifted: false,
        quarantined: false,
        refreshFailure: {
          code: 'rates_unavailable:unmapped_criterion:camera motion',
          modelKey: 'google/imagen-4',
          provider: 'replicate',
          reason: 'rates_unavailable:unmapped_criterion:camera motion',
        },
        version: 'sha256:current',
      });

      await service.discoverNewModels();

      // One card for the run, carrying both the price change and the failure.
      expect(sentScanCards()).toEqual([
        expect.objectContaining({
          priceChanges: [
            expect.objectContaining({
              changes: priceChange.changes,
              modelKey: 'google/imagen-4',
            }),
          ],
          provider: 'replicate',
          unreadable: [
            expect.objectContaining({
              code: 'rates_unavailable:unmapped_criterion:camera motion',
              modelKey: 'google/imagen-4',
            }),
          ],
        }),
      ]);
      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          deduplicationKey: expect.stringMatching(
            /^message\.model-scan\/replicate\/[0-9a-f]{16}$/,
          ),
          organizationId: null,
        }),
      );
    });

    it('puts a sync that throws and a model that cannot be fetched on the one card', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ next: null, results: [] }),
        ok: true,
      } as Response);
      replicateContractSyncService.synchronizeModel.mockRejectedValueOnce(
        new Error('boom'),
      );
      modelDiscoveryService.fetchReplicateModel.mockResolvedValueOnce({
        status: 'failed',
      });

      await service.discoverNewModels();

      const [card] = sentScanCards();
      expect(sentScanCards()).toHaveLength(1);
      expect(
        (card as { unreadable: Array<{ code: string }> }).unreadable.map(
          (item) => item.code,
        ),
      ).toEqual(
        expect.arrayContaining(['model_fetch_failed', 'contract_sync_failed']),
      );
    });

    it('never syncs, fetches or re-drafts a retired row, listed or not', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            next: null,
            results: [
              {
                is_official: true,
                description: 'Retired but still listed',
                latest_version: { id: 'v1', openapi_schema: {} },
                name: 'imagen-4',
                owner: 'google',
                url: 'https://replicate.com/google/imagen-4',
              },
            ],
          }),
        ok: true,
      } as Response);
      const modelsService = Reflect.get(service, 'modelsService');
      modelsService.prisma.model.findMany.mockResolvedValueOnce([
        { ...mockExistingModels[0], lifecycle: ModelLifecycle.RETIRED },
        { ...mockExistingModels[1], lifecycle: ModelLifecycle.RETIRED },
      ]);

      const result = await service.discoverNewModels();

      // imagen-4 is listed, veo-3 is not: neither is synced or fetched.
      expect(
        replicateContractSyncService.synchronizeModel,
      ).not.toHaveBeenCalled();
      expect(modelDiscoveryService.fetchReplicateModel).not.toHaveBeenCalled();
      expect(modelDiscoveryService.createDraftModel).not.toHaveBeenCalled();
      expect(result.newModelsFound).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('refreshes the FLUX.3 Edit alias row from the model Replicate hosts', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ next: null, results: [] }),
        ok: true,
      } as Response);
      const modelsService = Reflect.get(service, 'modelsService');
      modelsService.prisma.model.findMany.mockResolvedValueOnce([
        {
          category: ModelCategory.IMAGE_EDIT,
          endpoint: 'black-forest-labs/flux-3-image-edit',
          id: 'flux-edit',
          isActive: true,
          isFree: false,
          key: 'black-forest-labs/flux-3-image-edit',
          pricingType: 'conditional',
          provider: ModelProvider.REPLICATE,
          providerCostUsd: 0.024,
          reviewedProviderContractVersion: 'rates:flux-3',
        },
      ]);

      const result = await service.discoverNewModels();

      expect(modelDiscoveryService.fetchReplicateModel).toHaveBeenCalledWith(
        'black-forest-labs',
        'flux-3-image',
      );
      expect(
        replicateContractSyncService.synchronizeModel,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'black-forest-labs/flux-3-image-edit',
          id: 'flux-edit',
        }),
        expect.objectContaining({ name: 'flux-3-image' }),
        expect.anything(),
        expect.anything(),
        expect.any(Date),
      );
      expect(replicateContractSyncService.recordFailure).not.toHaveBeenCalled();
      expect(result.errors).toBe(0);
    });

    it('posts one provider-level failure on the card when the whole Replicate sync fails', async () => {
      Reflect.get(
        service,
        'platformMarginService',
      ).hydrate.mockRejectedValueOnce(new Error('boom'));

      const result = await service.discoverNewModels();

      expect(result.errors).toBe(1);
      expect(sentScanCards()).toEqual([
        expect.objectContaining({
          unreadable: [
            expect.objectContaining({
              code: 'replicate_sync_failed',
              modelKey: 'provider:replicate',
            }),
          ],
        }),
      ]);
    });

    it('puts one provider-level failure, not one per model, on the card when every exact fetch fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ next: null, results: [] }),
        ok: true,
      } as Response);
      modelDiscoveryService.fetchReplicateModel.mockResolvedValue({
        status: 'failed',
      });

      await service.discoverNewModels();

      const [card] = sentScanCards();
      expect(sentScanCards()).toHaveLength(1);
      expect(
        (card as { unreadable: Array<{ code: string; modelKey: string }> })
          .unreadable,
      ).toEqual([
        expect.objectContaining({
          code: 'model_fetch_failed',
          modelKey: 'provider:replicate',
        }),
      ]);
    });

    it('should ignore models already in DB', async () => {
      // Mock Replicate API returning only existing models
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            next: null,
            results: [
              {
                is_official: true,
                description: 'Existing model',
                latest_version: { id: 'v1', openapi_schema: {} },
                name: 'imagen-4',
                owner: 'google',
                url: 'https://replicate.com/google/imagen-4',
              },
              {
                is_official: true,
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
                is_official: true,
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

    it('skips models Replicate does not mark official', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            next: null,
            results: [
              {
                is_official: false,
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
                  is_official: true,
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
                  is_official: true,
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
                is_official: true,
                description: 'Failing model',
                latest_version: { id: 'v1', openapi_schema: {} },
                name: 'failing-model',
                owner: 'google',
                url: 'https://replicate.com/google/failing-model',
              },
              {
                is_official: true,
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

  describe('the run report', () => {
    const listed = (
      owner: string,
      name: string,
      isOfficial = true,
    ): Record<string, unknown> => ({
      description: `${name} model`,
      is_official: isOfficial,
      latest_version: { id: `v-${name}`, openapi_schema: {} },
      name,
      owner,
      url: `https://replicate.com/${owner}/${name}`,
    });

    function listModels(...results: Array<Record<string, unknown>>): void {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ next: null, results }),
        ok: true,
      } as Response);
    }

    function rows(...extra: Array<Record<string, unknown>>): void {
      Reflect.get(
        service,
        'modelsService',
      ).prisma.model.findMany.mockResolvedValueOnce(extra);
    }

    const registryRow = (
      endpoint: string,
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
      category: ModelCategory.IMAGE,
      endpoint,
      id: `row-${endpoint}`,
      isActive: true,
      isFree: false,
      key: endpoint,
      pricingType: 'flat',
      provider: ModelProvider.REPLICATE,
      providerCostUsd: 0.04,
      providerSyncFailureCode: null,
      providerSyncStatus: 'fresh',
      reviewedProviderContractVersion: 'rates:reviewed',
      ...overrides,
    });

    const pageGone = {
      reason: 'page_status_404',
      status: 'unavailable' as const,
    };

    it('is empty when nothing needs an operator, and sends no alert', async () => {
      listModels();
      rows();

      const result = await service.discoverNewModels();

      expect(result.report).toMatchObject({
        dataErrors: [],
        delisted: [],
        newDrafts: [],
        priceChanges: [],
        provider: 'replicate',
        removedByProvider: [],
        unreadable: [],
      });
      expect(notificationsService.dispatch).not.toHaveBeenCalled();
    });

    it('counts the run on the report', async () => {
      listModels(listed('google', 'imagen-4'));
      rows(registryRow('google/imagen-4'));

      const { report } = await service.discoverNewModels();

      expect(report.totals).toMatchObject({
        errors: 0,
        newModelsFound: 0,
        polled: 1,
        synchronized: 1,
      });
      expect(report.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('drafts a new model with the price its page states and the category its billing says', async () => {
      listModels(listed('recraft-ai', 'recraft-v3'));
      rows();
      modelDiscoveryService.fetchReplicateBilling.mockResolvedValueOnce({
        sourceUrl: 'https://replicate.com/recraft-ai/recraft-v3',
        status: 'ok',
        tiers: RECRAFT_V3_TIERS,
      });
      modelDiscoveryService.classifyCategory.mockResolvedValueOnce({
        category: ModelCategory.IMAGE,
        source: 'billing',
      });
      modelDiscoveryService.createDraftModel.mockResolvedValueOnce({
        id: 'draft',
        key: 'recraft-ai/recraft-v3',
      } as unknown as ServerModelRecord);

      const { report } = await service.discoverNewModels();

      expect(modelDiscoveryService.classifyCategory).toHaveBeenCalledWith(
        expect.objectContaining({ billingFamily: 'image' }),
      );
      expect(report.newDrafts).toEqual([
        {
          billingUnit: 'output',
          category: ModelCategory.IMAGE,
          modelKey: 'recraft-ai/recraft-v3',
          providerCostUsd: 0.04,
          sourceUrl: 'https://replicate.com/recraft-ai/recraft-v3',
          unpricedReason: null,
        },
      ]);
      // The page was read before the draft existed, and no credits were made up.
      const [draftInput] = modelDiscoveryService.createDraftModel.mock.calls[0];
      expect(draftInput).toMatchObject({
        billingUnit: 'output',
        providerCostUsd: 0.04,
      });
      expect(draftInput).not.toHaveProperty('cost');
      expect(
        modelDiscoveryService.fetchReplicateBilling.mock.invocationCallOrder[0],
      ).toBeLessThan(
        modelDiscoveryService.createDraftModel.mock.invocationCallOrder[0],
      );
    });

    it('drafts a model whose page lists no readable rate unpriced, with the reason', async () => {
      listModels(listed('acme', 'odd-metric'));
      rows();
      modelDiscoveryService.createDraftModel.mockResolvedValueOnce({
        id: 'draft',
      } as unknown as ServerModelRecord);

      const { report } = await service.discoverNewModels();

      expect(report.newDrafts).toEqual([
        expect.objectContaining({
          providerCostUsd: null,
          unpricedReason: 'no_billing_config',
        }),
      ]);
    });

    it('does not draft a new model whose price page does not exist yet', async () => {
      listModels(listed('acme', 'no-page'));
      rows();
      modelDiscoveryService.fetchReplicateBilling.mockResolvedValueOnce(
        pageGone,
      );

      const { report } = await service.discoverNewModels();

      expect(modelDiscoveryService.createDraftModel).not.toHaveBeenCalled();
      expect(report.newDrafts).toEqual([]);
    });

    it('reports a model whose page is gone but whose API still serves it as delisted, once', async () => {
      listModels(listed('google', 'veo-3'));
      rows(registryRow('google/veo-3', { category: ModelCategory.VIDEO }));
      modelDiscoveryService.fetchReplicateBilling.mockResolvedValue(pageGone);

      const first = await service.discoverNewModels();

      expect(first.report.delisted).toEqual([
        {
          modelKey: 'google/veo-3',
          reason:
            'The public price page returns 404 but the API still serves the model.',
          sourceUrl: 'https://replicate.com/google/veo-3',
        },
      ]);
      expect(first.errors).toBe(0);
      expect(first.report.unreadable).toEqual([]);
      expect(
        replicateContractSyncService.recordProviderState,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'google/veo-3' }),
        { code: 'delisted_by_provider', status: 'delisted' },
        expect.any(Date),
      );
      expect(
        replicateContractSyncService.synchronizeModel,
      ).not.toHaveBeenCalled();
      expect(sentScanCards()).toEqual([first.report]);

      // The next run finds the row already recorded and says nothing.
      listModels(listed('google', 'veo-3'));
      rows(
        registryRow('google/veo-3', {
          category: ModelCategory.VIDEO,
          providerSyncFailureCode: 'delisted_by_provider',
          providerSyncStatus: 'delisted',
        }),
      );
      replicateContractSyncService.recordProviderState.mockResolvedValueOnce(
        false,
      );
      const second = await service.discoverNewModels();
      expect(second.report.delisted).toEqual([]);
    });

    it('reports a model the API no longer returns as removed, once, and does not retire it', async () => {
      listModels();
      rows(registryRow('google/upscaler'));
      modelDiscoveryService.fetchReplicateModel.mockResolvedValueOnce({
        status: 'not_found',
      });

      const { report, errors } = await service.discoverNewModels();

      expect(report.removedByProvider).toEqual([
        {
          modelKey: 'google/upscaler',
          reason: 'The Replicate API returns 404 for this model.',
          sourceUrl: 'https://replicate.com/google/upscaler',
        },
      ]);
      expect(errors).toBe(0);
      expect(report.unreadable).toEqual([]);
      expect(
        replicateContractSyncService.recordProviderState,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'google/upscaler' }),
        { code: 'removed_by_provider', status: 'removed' },
        expect.any(Date),
      );
      expect(sentScanCards()).toEqual([report]);
    });

    it('does not count removed models toward a provider-wide outage', async () => {
      listModels();
      rows(registryRow('google/upscaler'), registryRow('google/imagen-4'));
      modelDiscoveryService.fetchReplicateModel
        .mockResolvedValueOnce({ status: 'not_found' })
        .mockResolvedValueOnce({ status: 'failed' });

      const { report } = await service.discoverNewModels();

      // One real failure out of one real attempt is provider-wide; the removed
      // row is not an attempt that failed.
      expect(report.removedByProvider).toHaveLength(1);
      expect(report.unreadable).toEqual([
        expect.objectContaining({
          code: 'model_fetch_failed',
          modelKey: 'provider:replicate',
        }),
      ]);
    });

    it('says nothing about a removed model that is inactive or already known as unavailable', async () => {
      listModels();
      rows(
        registryRow('google/upscaler', { isActive: false }),
        registryRow('kwaivgi/kling-v1.6-pro'),
      );
      modelDiscoveryService.fetchReplicateModel.mockResolvedValue({
        status: 'not_found',
      });

      const { report } = await service.discoverNewModels();

      expect(report.removedByProvider).toEqual([]);
      expect(notificationsService.dispatch).not.toHaveBeenCalled();
    });

    it('fetches a pinned-version endpoint by owner and name only', async () => {
      listModels();
      rows(
        registryRow(
          'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb',
          {
            category: ModelCategory.MUSIC,
          },
        ),
      );

      await service.discoverNewModels();

      expect(modelDiscoveryService.fetchReplicateModel).toHaveBeenCalledWith(
        'meta',
        'musicgen',
      );
      expect(
        replicateContractSyncService.synchronizeModel,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: expect.stringContaining('meta/musicgen:'),
        }),
        expect.objectContaining({ name: 'musicgen', owner: 'meta' }),
        expect.anything(),
        expect.anything(),
        expect.any(Date),
      );
    });

    it('reports a row stored under Replicate for an endpoint it never hosted as a data error, once, without asking the provider', async () => {
      listModels();
      rows(
        registryRow('argil/atom', { isActive: false }),
        registryRow('baai/bge-large-en-v1.5', { isActive: false }),
      );

      const { report } = await service.discoverNewModels();

      expect(report.dataErrors.map((error) => error.modelKey)).toEqual([
        'argil/atom',
        'baai/bge-large-en-v1.5',
      ]);
      expect(modelDiscoveryService.fetchReplicateModel).not.toHaveBeenCalled();
      expect(report.unreadable).toEqual([]);
      expect(sentScanCards()).toEqual([report]);

      listModels();
      rows(registryRow('argil/atom', { isActive: false }));
      replicateContractSyncService.recordProviderState.mockResolvedValueOnce(
        false,
      );
      const second = await service.discoverNewModels();
      expect(second.report.dataErrors).toEqual([]);
    });

    it('puts a changed price on the report with its urgency, and still alerts once', async () => {
      listModels(listed('google', 'imagen-4'));
      rows(registryRow('google/imagen-4'));
      replicateContractSyncService.synchronizeModel.mockResolvedValueOnce({
        drifted: true,
        priceChange: {
          changes: [
            {
              component: 'output',
              newPriceUsd: 0.07,
              oldPriceUsd: 0.0205,
              unit: 'output',
              variant: 'resolution=1.5k',
            },
          ],
          isUrgent: true,
          modelKey: 'google/imagen-4',
          pendingRateHash: 'rates:sha256:urgent',
          provider: 'replicate',
          sourceUrl: 'https://replicate.com/google/imagen-4',
          urgentReason:
            'resolution=1.5k: provider cost $0.07 per output is above our sell price $0.07',
        },
        quarantined: false,
        version: 'sha256:changed',
      });

      const { report } = await service.discoverNewModels();

      expect(report.priceChanges).toEqual([
        expect.objectContaining({
          isUrgent: true,
          modelKey: 'google/imagen-4',
          pendingRateHash: 'rates:sha256:urgent',
        }),
      ]);
      expect(report.totals.drifted).toBe(1);
    });

    it('keeps a refresh failure of an inactive or known-unavailable row off the report and the channel', async () => {
      listModels(listed('google', 'imagen-4'), listed('google', 'veo-3'));
      rows(
        registryRow('google/imagen-4', { isActive: false }),
        registryRow('google/veo-3'),
      );
      const failure = (modelKey: string) => ({
        drifted: false,
        quarantined: false,
        refreshFailure: {
          code: 'rates_unavailable:no_billing_config',
          modelKey,
          provider: 'replicate',
          reason: 'rates_unavailable:no_billing_config',
        },
        version: 'sha256:current',
      });
      replicateContractSyncService.synchronizeModel
        .mockResolvedValueOnce(failure('google/imagen-4'))
        .mockResolvedValueOnce(failure('google/veo-3'));

      const { report } = await service.discoverNewModels();

      expect(report.unreadable.map((item) => item.modelKey)).toEqual([
        'google/veo-3',
      ]);
    });

    it('lists a refresh failure for an active model on the report', async () => {
      listModels();
      rows(registryRow('google/imagen-4'));
      modelDiscoveryService.fetchReplicateModel.mockResolvedValueOnce({
        status: 'failed',
      });
      rows();

      const { report } = await service.discoverNewModels();

      expect(report.totals.errors).toBe(report.unreadable.length);
    });

    describe('the 2026-11-15 scan, card by card', () => {
      it.each([
        ['recraft-ai', 'recraft-v3', RECRAFT_V3_TIERS, 'image', 0.04],
        ['recraft-ai', 'recraft-v3-svg', RECRAFT_V3_SVG_TIERS, 'image', 0.08],
        [
          'recraft-ai',
          'recraft-v4-pro-svg',
          RECRAFT_V4_PRO_SVG_TIERS,
          'image',
          0.3,
        ],
        ['google', 'gemini-4-carbon', GEMINI_4_CARBON_TIERS, 'text', 0.00001],
        [
          'xai',
          'grok-text-to-speech',
          GROK_TEXT_TO_SPEECH_TIERS,
          'voice',
          0.000015,
        ],
      ])(
        'drafts a model from the price its page states (%#)',
        async (owner, name, tiers, family, providerCostUsd) => {
          listModels(listed(owner, name));
          rows();
          modelDiscoveryService.fetchReplicateBilling.mockResolvedValueOnce({
            sourceUrl: `https://replicate.com/${owner}/${name}`,
            status: 'ok',
            tiers,
          });
          modelDiscoveryService.createDraftModel.mockResolvedValueOnce({
            id: 'draft',
          } as unknown as ServerModelRecord);

          const { report } = await service.discoverNewModels();

          expect(modelDiscoveryService.classifyCategory).toHaveBeenCalledWith(
            expect.objectContaining({ billingFamily: family }),
          );
          expect(report.newDrafts).toHaveLength(1);
          expect(report.newDrafts[0].unpricedReason).toBeNull();
          expect(report.newDrafts[0].providerCostUsd).toBeCloseTo(
            providerCostUsd,
            9,
          );
        },
      );

      it.each([
        ['minimax', 'video-01', MINIMAX_VIDEO_01_TIERS],
        ['wan-video', 'wan-2.5-t2v', WAN_2_5_T2V_TIERS],
        ['qwen', 'qwen3-7-plus', QWEN3_7_PLUS_TIERS],
      ])(
        'drafts a model unpriced, with the reason, instead of a guessed price (%#)',
        async (owner, name, tiers) => {
          listModels(listed(owner, name));
          rows();
          modelDiscoveryService.fetchReplicateBilling.mockResolvedValueOnce({
            sourceUrl: `https://replicate.com/${owner}/${name}`,
            status: 'ok',
            tiers,
          });
          modelDiscoveryService.createDraftModel.mockResolvedValueOnce({
            id: 'draft',
          } as unknown as ServerModelRecord);

          const { report } = await service.discoverNewModels();

          expect(report.newDrafts).toEqual([
            expect.objectContaining({ providerCostUsd: null }),
          ]);
          expect(report.newDrafts[0].unpricedReason).toEqual(
            expect.any(String),
          );
        },
      );

      it('sorts the other cards of the day into delisted, removed, data error and read', async () => {
        const delisted = ['google/veo-3', 'openai/sora-2', 'google/imagen-4'];
        listModels(
          ...delisted.map((key) => {
            const [owner, name] = key.split('/');
            return listed(owner, name);
          }),
          listed('meta', 'musicgen'),
        );
        rows(
          ...delisted.map((key) => registryRow(key)),
          registryRow(
            'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb',
            { category: ModelCategory.MUSIC },
          ),
          registryRow('google/upscaler'),
          registryRow('argil/atom'),
          registryRow('baai/bge-large-en-v1.5'),
        );
        modelDiscoveryService.fetchReplicateBilling.mockImplementation(
          (owner: string, name: string) =>
            Promise.resolve(
              owner === 'meta' && name === 'musicgen'
                ? { sourceUrl: 'u', status: 'ok' as const, tiers: [] }
                : pageGone,
            ),
        );
        modelDiscoveryService.fetchReplicateModel.mockImplementation(
          (owner: string, name: string) =>
            Promise.resolve(
              name === 'upscaler'
                ? { status: 'not_found' as const }
                : {
                    model: listed(owner, name) as unknown as IReplicateModel,
                    status: 'ok' as const,
                  },
            ),
        );

        const { report } = await service.discoverNewModels();

        expect(report.delisted.map((card) => card.modelKey).sort()).toEqual(
          [...delisted].sort(),
        );
        expect(report.removedByProvider.map((card) => card.modelKey)).toEqual([
          'google/upscaler',
        ]);
        expect(report.dataErrors.map((card) => card.modelKey).sort()).toEqual([
          'argil/atom',
          'baai/bge-large-en-v1.5',
        ]);
        // musicgen is read by its name without the pinned version: no failure card.
        expect(report.unreadable).toEqual([]);
        expect(report.totals.errors).toBe(0);
      });
    });

    it('puts the provider outage on the report and returns the summary', async () => {
      Reflect.get(
        service,
        'platformMarginService',
      ).hydrate.mockRejectedValueOnce(new Error('boom'));

      const { report, errors } = await service.discoverNewModels();

      expect(errors).toBe(1);
      expect(report.unreadable).toEqual([
        expect.objectContaining({
          code: 'replicate_sync_failed',
          modelKey: 'provider:replicate',
        }),
      ]);
      expect(report.totals.errors).toBe(1);
    });
  });
});
