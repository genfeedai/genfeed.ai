import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { UNIFIED_MODEL_CATALOG } from '@genfeedai/constants';
import type { LoggerService } from '@libs/logger/logger.service';

import { ModelCatalogSeedService } from './model-catalog-seed.service';

interface UpsertCall {
  create: Record<string, unknown>;
  update: Record<string, unknown>;
  where: { key: string };
}

describe('ModelCatalogSeedService', () => {
  let prisma: {
    model: {
      updateMany: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let service: ModelCatalogSeedService;

  const upsertCalls = (): UpsertCall[] =>
    prisma.model.upsert.mock.calls.map(([call]) => call as UpsertCall);

  const callForKey = (key: string): UpsertCall | undefined =>
    upsertCalls().find((call) => call.where.key === key);

  beforeEach(() => {
    prisma = {
      model: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue({ id: 'model' }),
      },
    };
    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new ModelCatalogSeedService(
      prisma as unknown as PrismaService,
      logger as unknown as LoggerService,
    );
  });

  it('upserts one registry row per catalog entry, keyed by model key', async () => {
    const upserted = await service.reconcileCatalog();

    expect(upserted).toBe(UNIFIED_MODEL_CATALOG.length);
    expect(prisma.model.upsert).toHaveBeenCalledTimes(
      UNIFIED_MODEL_CATALOG.length,
    );
    expect(logger.log).toHaveBeenCalledWith(
      `Model catalog reconciled (${UNIFIED_MODEL_CATALOG.length} registry rows)`,
      'ModelCatalogSeedService',
    );
  });

  it('is idempotent — a second run issues the same upserts', async () => {
    await service.reconcileCatalog();
    const first = upsertCalls();

    prisma.model.upsert.mockClear();
    await service.reconcileCatalog();

    expect(upsertCalls()).toEqual(first);
  });

  it('never overwrites an existing price with an unpriced catalog entry', async () => {
    const unpriced = UNIFIED_MODEL_CATALOG.find((entry) => entry.cost === 0);
    expect(unpriced).toBeDefined();

    await service.reconcileCatalog();

    const call = callForKey(unpriced?.key ?? '');
    expect(call?.update).not.toHaveProperty('cost');
    expect(call?.create).toMatchObject({ cost: 0, isActive: false });
  });

  it('leaves operator activation alone for non-default entries', async () => {
    const nonDefault = UNIFIED_MODEL_CATALOG.find((entry) => !entry.isDefault);
    expect(nonDefault).toBeDefined();

    await service.reconcileCatalog();

    const call = callForKey(nonDefault?.key ?? '');
    expect(call?.update).not.toHaveProperty('isActive');
    expect(call?.update).not.toHaveProperty('isDefault');
  });

  it('keeps default models active so the router always has a selection', async () => {
    const defaultEntry = UNIFIED_MODEL_CATALOG.find((entry) => entry.isDefault);
    expect(defaultEntry).toBeDefined();

    await service.reconcileCatalog();

    expect(callForKey(defaultEntry?.key ?? '')?.update).toMatchObject({
      isActive: true,
      isDefault: true,
    });
  });

  it('demotes other defaults in a category when promoting a catalog default', async () => {
    const videoDefault = UNIFIED_MODEL_CATALOG.find(
      (entry) => entry.category === 'video' && entry.isDefault,
    );
    expect(videoDefault?.key).toBe('bytedance/seedance-2.5');

    await service.reconcileCatalog();

    expect(prisma.model.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isDefault: false },
        where: expect.objectContaining({
          category: 'video',
          isDefault: true,
          key: { not: 'bytedance/seedance-2.5' },
        }),
      }),
    );
  });

  it('writes per-second pricing fields for Seedance 2.5', async () => {
    await service.reconcileCatalog();

    const call = callForKey('bytedance/seedance-2.5');
    expect(call?.create).toMatchObject({
      cost: 400,
      costPerUnit: 80,
      minCost: 200,
      pricingType: 'per-second',
    });
    expect(call?.update).toMatchObject({
      cost: 400,
      costPerUnit: 80,
      minCost: 200,
      pricingType: 'per-second',
    });
  });

  it('carries the successor forward on retired rows', async () => {
    const legacyEntry = UNIFIED_MODEL_CATALOG.find(
      (entry) => entry.isLegacy && entry.succeededBy,
    );
    expect(legacyEntry).toBeDefined();

    await service.reconcileCatalog();

    const call = callForKey(legacyEntry?.key ?? '');
    expect(call?.create).toMatchObject({
      isLegacy: true,
      succeededBy: legacyEntry?.succeededBy,
    });
    expect(call?.update).toMatchObject({
      isLegacy: true,
      succeededBy: legacyEntry?.succeededBy,
    });
  });

  it('logs and swallows a failed reconcile so boot is never blocked', async () => {
    prisma.model.upsert.mockRejectedValue(new Error('connection refused'));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      'Model catalog seed failed — registry may be incomplete',
      expect.any(Error),
      'ModelCatalogSeedService',
    );
  });
});
