import type { ModelsService } from '@api/collections/models/services/models.service';
import type { ByokService } from '@api/services/byok/byok.service';
import { MediaGenerationCostService } from '@api/services/media-vendor-cost/media-generation-cost.service';
import type { MediaVendorCostLedgerService } from '@api/services/media-vendor-cost/media-vendor-cost-ledger.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ByokProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';

type LedgerRow = Record<string, unknown>;
type ModelRow = Record<string, unknown> & { key: string };

describe('MediaGenerationCostService', () => {
  const videoModel: ModelRow = {
    defaultDuration: 5,
    key: 'bytedance/seedance-2.5',
    pricingType: 'per-second',
    provider: 'replicate',
    providerCostUsd: 0.24,
  };

  let activeByok: Set<string>;
  let errors: string[];
  let isLedgerDown: boolean;
  let ledger: LedgerRow[];
  let models: Map<string, ModelRow>;
  let service: MediaGenerationCostService;

  const seedModel = (model: ModelRow) => models.set(model.key, model);

  beforeEach(() => {
    activeByok = new Set();
    errors = [];
    isLedgerDown = false;
    ledger = [];
    models = new Map();
    seedModel(videoModel);

    service = new MediaGenerationCostService(
      {
        findOne: async ({ key }: { key: string }) => models.get(key) ?? null,
      } as unknown as ModelsService,
      {
        isByokActiveForProvider: async (
          organizationId: string,
          provider: ByokProvider,
        ) => activeByok.has(`${organizationId}:${provider}`),
      } as unknown as ByokService,
      {
        record: async (row: LedgerRow) => {
          if (isLedgerDown) {
            throw new Error('db down');
          }
          ledger.push(row);
        },
      } as unknown as MediaVendorCostLedgerService,
      {
        debug: () => undefined,
        error: (message: string) => errors.push(message),
        log: () => undefined,
      } as unknown as LoggerService,
      {
        crunGenerationTask: { findFirst: async () => null },
        ingredient: { findFirst: async () => null },
      } as unknown as PrismaService,
    );
  });

  it('records realized vendor cost from the model provider cost', async () => {
    await service.recordGenerationCost({
      brandId: 'brand-1',
      category: 'video',
      durationSeconds: 10,
      ingredientId: 'ing-1',
      modelKey: 'bytedance/seedance-2.5',
      organizationId: 'org-1',
    });

    expect(ledger).toEqual([
      {
        brandId: 'brand-1',
        category: 'video',
        costEvidence: 'calculated',
        ingredientId: 'ing-1',
        isByok: false,
        model: 'bytedance/seedance-2.5',
        organizationId: 'org-1',
        pricingType: 'per-second',
        provider: 'replicate',
        realizedDurationSeconds: 10,
        realizedHeight: undefined,
        realizedWidth: undefined,
        units: 10,
        vendorCostMicros: 2_400_000,
      },
    ]);
  });

  it('zeroes vendor cost for BYOK organizations but keeps the row', async () => {
    activeByok.add(`org-1:${ByokProvider.REPLICATE}`);

    await service.recordGenerationCost({
      category: 'video',
      durationSeconds: 10,
      ingredientId: 'ing-1',
      modelKey: 'bytedance/seedance-2.5',
      organizationId: 'org-1',
    });

    expect(ledger).toEqual([
      expect.objectContaining({ isByok: true, vendorCostMicros: 0 }),
    ]);
  });

  it('does not record Higgsfield usage as Replicate BYOK', async () => {
    seedModel({ ...videoModel, key: MODEL_KEYS.HIGGSFIELD_DOP_TURBO });
    activeByok.add(`org-1:${ByokProvider.REPLICATE}`);

    await service.recordGenerationCost({
      category: 'video',
      durationSeconds: 5,
      ingredientId: 'ing-higgsfield',
      modelKey: MODEL_KEYS.HIGGSFIELD_DOP_TURBO,
      organizationId: 'org-1',
    });

    expect(ledger).toEqual([
      expect.objectContaining({
        isByok: false,
        provider: ByokProvider.HIGGSFIELD,
        vendorCostMicros: 1_200_000,
      }),
    ]);
  });

  it('zeroes Higgsfield cost when the organization brings its own Higgsfield key', async () => {
    seedModel({ ...videoModel, key: MODEL_KEYS.HIGGSFIELD_DOP_TURBO });
    activeByok.add(`org-1:${ByokProvider.HIGGSFIELD}`);

    await service.recordGenerationCost({
      category: 'video',
      durationSeconds: 5,
      ingredientId: 'ing-higgsfield',
      modelKey: MODEL_KEYS.HIGGSFIELD_DOP_TURBO,
      organizationId: 'org-1',
    });

    expect(ledger).toEqual([
      expect.objectContaining({
        isByok: true,
        provider: ByokProvider.HIGGSFIELD,
        vendorCostMicros: 0,
      }),
    ]);
  });

  it('records a zero-cost row for models without providerCostUsd', async () => {
    seedModel({ cost: 50, key: 'legacy/model', provider: 'replicate' });

    await service.recordGenerationCost({
      category: 'image',
      ingredientId: 'ing-1',
      modelKey: 'legacy/model',
      organizationId: 'org-1',
    });

    expect(ledger).toEqual([
      expect.objectContaining({ model: 'legacy/model', vendorCostMicros: 0 }),
    ]);
  });

  it('skips silently when org or model key is missing', async () => {
    await service.recordGenerationCost({
      category: 'image',
      ingredientId: 'ing-1',
      modelKey: null,
      organizationId: 'org-1',
    });
    await service.recordGenerationCost({
      category: 'image',
      ingredientId: 'ing-2',
      modelKey: 'bytedance/seedance-2.5',
      organizationId: null,
    });

    expect(ledger).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('skips when the model row is unknown', async () => {
    await service.recordGenerationCost({
      category: 'image',
      ingredientId: 'ing-1',
      modelKey: 'unknown/model',
      organizationId: 'org-1',
    });

    expect(ledger).toEqual([]);
  });

  it('never throws when the ledger write fails', async () => {
    isLedgerDown = true;

    await expect(
      service.recordGenerationCost({
        category: 'video',
        durationSeconds: 10,
        ingredientId: 'ing-1',
        modelKey: 'bytedance/seedance-2.5',
        organizationId: 'org-1',
      }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      'MediaGenerationCostService failed to record media vendor cost',
    ]);
  });
});
