import type { ModelsService } from '@api/collections/models/services/models.service';
import type { ByokService } from '@api/services/byok/byok.service';
import { MediaGenerationCostService } from '@api/services/media-vendor-cost/media-generation-cost.service';
import type { MediaVendorCostLedgerService } from '@api/services/media-vendor-cost/media-vendor-cost-ledger.service';
import { ByokProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';

describe('MediaGenerationCostService', () => {
  const modelsService = { findOne: vi.fn() };
  const byokService = { isByokActiveForProvider: vi.fn() };
  const ledgerService = { record: vi.fn() };
  const logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn() };

  const videoModel = {
    defaultDuration: 5,
    key: 'bytedance/seedance-2.5',
    pricingType: 'per-second',
    provider: 'replicate',
    providerCostUsd: 0.24,
  };

  let service: MediaGenerationCostService;

  beforeEach(() => {
    vi.clearAllMocks();
    modelsService.findOne.mockResolvedValue(videoModel);
    byokService.isByokActiveForProvider.mockResolvedValue(false);
    ledgerService.record.mockResolvedValue(undefined);
    service = new MediaGenerationCostService(
      modelsService as unknown as ModelsService,
      byokService as unknown as ByokService,
      ledgerService as unknown as MediaVendorCostLedgerService,
      logger as unknown as LoggerService,
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

    expect(ledgerService.record).toHaveBeenCalledWith({
      brandId: 'brand-1',
      category: 'video',
      ingredientId: 'ing-1',
      isByok: false,
      model: 'bytedance/seedance-2.5',
      organizationId: 'org-1',
      pricingType: 'per-second',
      provider: 'replicate',
      units: 10,
      vendorCostMicros: 2_400_000,
    });
  });

  it('zeroes vendor cost for BYOK organizations but keeps the row', async () => {
    byokService.isByokActiveForProvider.mockResolvedValue(true);

    await service.recordGenerationCost({
      category: 'video',
      durationSeconds: 10,
      ingredientId: 'ing-1',
      modelKey: 'bytedance/seedance-2.5',
      organizationId: 'org-1',
    });

    expect(ledgerService.record).toHaveBeenCalledWith(
      expect.objectContaining({ isByok: true, vendorCostMicros: 0 }),
    );
  });

  it('does not record Higgsfield usage as Replicate BYOK', async () => {
    modelsService.findOne.mockResolvedValue({
      ...videoModel,
      key: MODEL_KEYS.HIGGSFIELD_KLING_VIDEO,
    });
    byokService.isByokActiveForProvider.mockImplementation(
      (_organizationId: string, provider: ByokProvider) =>
        Promise.resolve(provider === ByokProvider.REPLICATE),
    );

    await service.recordGenerationCost({
      category: 'video',
      durationSeconds: 5,
      ingredientId: 'ing-higgsfield',
      modelKey: MODEL_KEYS.HIGGSFIELD_KLING_VIDEO,
      organizationId: 'org-1',
    });

    expect(byokService.isByokActiveForProvider).toHaveBeenCalledWith(
      'org-1',
      ByokProvider.HIGGSFIELD,
    );
    expect(ledgerService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        isByok: false,
        provider: ByokProvider.HIGGSFIELD,
        vendorCostMicros: 1_200_000,
      }),
    );
  });

  it('records a zero-cost row for models without providerCostUsd', async () => {
    modelsService.findOne.mockResolvedValue({
      cost: 50,
      key: 'legacy/model',
      provider: 'replicate',
    });

    await service.recordGenerationCost({
      category: 'image',
      ingredientId: 'ing-1',
      modelKey: 'legacy/model',
      organizationId: 'org-1',
    });

    expect(ledgerService.record).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'legacy/model', vendorCostMicros: 0 }),
    );
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
      modelKey: 'some/model',
      organizationId: null,
    });

    expect(modelsService.findOne).not.toHaveBeenCalled();
    expect(ledgerService.record).not.toHaveBeenCalled();
  });

  it('skips when the model row is unknown', async () => {
    modelsService.findOne.mockResolvedValue(null);

    await service.recordGenerationCost({
      category: 'image',
      ingredientId: 'ing-1',
      modelKey: 'unknown/model',
      organizationId: 'org-1',
    });

    expect(ledgerService.record).not.toHaveBeenCalled();
  });

  it('never throws when the ledger write fails', async () => {
    ledgerService.record.mockRejectedValue(new Error('db down'));

    await expect(
      service.recordGenerationCost({
        category: 'video',
        durationSeconds: 10,
        ingredientId: 'ing-1',
        modelKey: 'bytedance/seedance-2.5',
        organizationId: 'org-1',
      }),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
