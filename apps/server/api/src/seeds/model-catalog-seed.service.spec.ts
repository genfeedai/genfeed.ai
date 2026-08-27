import type { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import {
  getModelCatalogForDeployment,
  LOWEST_COST_VIDEO_MODEL_KEY,
  UNIFIED_MODEL_CATALOG,
} from '@genfeedai/constants';
import type { ConfigService } from '@libs/config/config.service';
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
      { get: () => 'test' } as unknown as ConfigService,
    );
  });

  it('upserts one registry row per catalog entry, keyed by model key', async () => {
    const upserted = await service.reconcileCatalog(UNIFIED_MODEL_CATALOG);

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
    await service.reconcileCatalog(UNIFIED_MODEL_CATALOG);
    const first = upsertCalls();

    prisma.model.upsert.mockClear();
    await service.reconcileCatalog(UNIFIED_MODEL_CATALOG);

    expect(upsertCalls()).toEqual(first);
  });

  it('never overwrites an existing price with an unpriced catalog entry', async () => {
    // `isFree` rows are also cost 0 but curated that way — pick a genuinely
    // unpriced one so this asserts the uncurated guard, not the free exception.
    const unpriced = UNIFIED_MODEL_CATALOG.find(
      (entry) => entry.cost === 0 && !entry.isFree,
    );
    expect(unpriced).toBeDefined();

    await service.reconcileCatalog(UNIFIED_MODEL_CATALOG);

    const call = callForKey(unpriced?.key ?? '');
    expect(call?.update).not.toHaveProperty('cost');
    expect(call?.create).toMatchObject({ cost: 0, isActive: false });
  });

  it('writes the zero price of a declared-free catalog entry', async () => {
    const free = UNIFIED_MODEL_CATALOG.find((entry) => entry.isFree);

    await service.reconcileCatalog(UNIFIED_MODEL_CATALOG);

    const call = callForKey(free?.key ?? '');
    expect(call?.update).toMatchObject({ cost: 0 });
    expect(call?.create).toMatchObject({ cost: 0, isActive: true });
  });

  it('leaves operator activation alone for non-default entries', async () => {
    const nonDefault = UNIFIED_MODEL_CATALOG.find((entry) => !entry.isDefault);
    expect(nonDefault).toBeDefined();

    await service.reconcileCatalog(UNIFIED_MODEL_CATALOG);

    const call = callForKey(nonDefault?.key ?? '');
    expect(call?.update).not.toHaveProperty('isActive');
    expect(call?.update).not.toHaveProperty('isDefault');
  });

  it('keeps default models active so the router always has a selection', async () => {
    const defaultEntry = UNIFIED_MODEL_CATALOG.find((entry) => entry.isDefault);
    expect(defaultEntry).toBeDefined();

    await service.reconcileCatalog(UNIFIED_MODEL_CATALOG);

    expect(callForKey(defaultEntry?.key ?? '')?.update).toMatchObject({
      isActive: true,
      isDefault: true,
      isDiscovered: false,
      isPublic: true,
    });
  });

  it('demotes other defaults in a category when promoting a catalog default', async () => {
    const videoDefault = UNIFIED_MODEL_CATALOG.find(
      (entry) => entry.category === 'video' && entry.isDefault,
    );
    expect(videoDefault?.key).toBe('minimax/h3');

    await service.reconcileCatalog(UNIFIED_MODEL_CATALOG);

    expect(prisma.model.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isDefault: false },
        where: expect.objectContaining({
          category: 'video',
          isDefault: true,
          key: { not: 'minimax/h3' },
        }),
      }),
    );
  });

  it('writes provider cost and generation controls for MiniMax H3', async () => {
    await service.reconcileCatalog(UNIFIED_MODEL_CATALOG);

    const call = callForKey('minimax/h3');
    expect(call?.create).toMatchObject({
      defaultDuration: 5,
      durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      hasDurationEditing: true,
      hasEndFrame: true,
      hasResolutionOptions: true,
      pricingType: 'per-second',
      providerCostUsd: 0.13,
    });
    expect(call?.update).toMatchObject({
      hasDurationEditing: true,
      hasEndFrame: true,
      hasResolutionOptions: true,
      pricingType: 'per-second',
      providerCostUsd: 0.13,
    });
  });

  it('carries the successor forward on retired rows', async () => {
    const legacyEntry = UNIFIED_MODEL_CATALOG.find(
      (entry) => entry.isLegacy && entry.succeededBy,
    );
    expect(legacyEntry).toBeDefined();

    await service.reconcileCatalog(UNIFIED_MODEL_CATALOG);

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

  it('demotes the previous category default before upserting a new one', async () => {
    const events: Array<{ category?: string; key?: string; op: string }> = [];
    prisma.model.updateMany.mockImplementation(
      async (args: { where?: { category?: string } }) => {
        events.push({ category: args.where?.category, op: 'updateMany' });
        return { count: 1 };
      },
    );
    prisma.model.upsert.mockImplementation(
      async (args: { where: { key: string } }) => {
        events.push({ key: args.where.key, op: 'upsert' });
        return { id: 'model' };
      },
    );

    await service.reconcileCatalog(getModelCatalogForDeployment(false));

    const videoDemote = events.findIndex(
      (event) => event.op === 'updateMany' && event.category === 'video',
    );
    const videoUpsert = events.findIndex(
      (event) =>
        event.op === 'upsert' && event.key === LOWEST_COST_VIDEO_MODEL_KEY,
    );

    expect(videoDemote).toBeGreaterThanOrEqual(0);
    expect(videoUpsert).toBeGreaterThan(videoDemote);
  });

  it('promotes the lowest-cost video default when seeding the local catalog', async () => {
    const localCatalog = getModelCatalogForDeployment(false);

    await service.reconcileCatalog(localCatalog);

    expect(prisma.model.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isDefault: false },
        where: expect.objectContaining({
          category: 'video',
          isDefault: true,
          key: { not: LOWEST_COST_VIDEO_MODEL_KEY },
        }),
      }),
    );
    expect(callForKey(LOWEST_COST_VIDEO_MODEL_KEY)?.update).toMatchObject({
      isActive: true,
      isDefault: true,
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
