import { ModelCategory, ModelLifecycle } from '@genfeedai/contracts';
import {
  CronHiggsfieldModelWatcherService,
  HIGGSFIELD_MIN_PLAUSIBLE_CATALOG_SIZE,
  NOT_IN_CATALOG_CODE,
} from '@workers/crons/higgsfield-model-watcher/cron.higgsfield-model-watcher.service';
import type { HiggsfieldCatalogSnapshot } from '@workers/crons/higgsfield-model-watcher/higgsfield-docs-catalog.client';
import type { HiggsfieldCatalogEntry } from '@workers/crons/higgsfield-model-watcher/higgsfield-docs-catalog.util';
import { describe, expect, it, vi } from 'vitest';

interface RegistryRow {
  endpoint: string;
  id: string;
  isActive: boolean;
  key: string;
  lifecycle: string | null;
  providerSyncFailureCode: string | null;
}

function catalogEntry(endpoint: string): HiggsfieldCatalogEntry {
  return {
    category: ModelCategory.VIDEO,
    endpoint,
    label: `Label ${endpoint}`,
    sourceUrl: `https://docs.higgsfield.ai/docs/models/${endpoint}.md`,
  };
}

/** A plausible full catalog: enough endpoints to be trusted, plus the named ones. */
function fullCatalog(
  extra: readonly string[],
  failedUrls: string[] = [],
): HiggsfieldCatalogSnapshot {
  const filler = Array.from(
    { length: HIGGSFIELD_MIN_PLAUSIBLE_CATALOG_SIZE },
    (_, index) => `filler/model-${index}`,
  );
  return {
    entries: [...filler, ...extra].map(catalogEntry),
    failedUrls,
  };
}

function registryRow(overrides: Partial<RegistryRow>): RegistryRow {
  return {
    endpoint: 'higgsfield-ai/dop/standard',
    id: 'row-dop',
    isActive: true,
    key: 'higgsfield-ai/dop/standard',
    lifecycle: ModelLifecycle.AVAILABLE,
    providerSyncFailureCode: null,
    ...overrides,
  };
}

function createWatcher(options: {
  catalog: HiggsfieldCatalogSnapshot | Error;
  rows: RegistryRow[];
}) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const dispatch = vi.fn().mockResolvedValue(undefined);
  const createDraftModel = vi.fn(
    async (input: { endpoint: string; provider: string }) => ({
      key: input.endpoint,
    }),
  );
  const service = new CronHiggsfieldModelWatcherService(
    { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
    {
      prisma: {
        model: {
          findMany: vi.fn().mockResolvedValue(options.rows),
          updateMany,
        },
      },
    } as never,
    { createDraftModel } as never,
    { dispatch } as never,
    {
      fetchCatalog: async () => {
        if (options.catalog instanceof Error) throw options.catalog;
        return options.catalog;
      },
    } as never,
  );
  return { createDraftModel, dispatch, service, updateMany };
}

describe('CronHiggsfieldModelWatcherService', () => {
  it('drafts only the endpoints the registry does not have', async () => {
    const { createDraftModel, service } = createWatcher({
      catalog: fullCatalog(['higgsfield/genjutsu/restyle/v1.0']),
      rows: Array.from(
        { length: HIGGSFIELD_MIN_PLAUSIBLE_CATALOG_SIZE },
        (_, index) =>
          registryRow({
            endpoint: `filler/model-${index}`,
            id: `row-${index}`,
            key: `filler/model-${index}`,
          }),
      ),
    });

    const summary = await service.discoverModels();

    expect(summary.draftsCreated).toBe(1);
    expect(summary.report.newDrafts).toEqual([
      {
        billingUnit: null,
        category: 'video',
        modelKey: 'higgsfield/genjutsu/restyle/v1.0',
        providerCostUsd: null,
        sourceUrl:
          'https://docs.higgsfield.ai/docs/models/higgsfield/genjutsu/restyle/v1.0.md',
        unpricedReason: expect.stringContaining('estimate endpoint'),
      },
    ]);
    expect(createDraftModel.mock.calls[0]?.[0]).toMatchObject({
      endpoint: 'higgsfield/genjutsu/restyle/v1.0',
      provider: 'higgsfield',
    });
  });

  it('reports an active row the docs no longer list, once', async () => {
    const first = createWatcher({
      catalog: fullCatalog([]),
      rows: [registryRow({})],
    });

    const firstSummary = await first.service.discoverModels();

    expect(firstSummary.report.removedByProvider).toEqual([
      {
        modelKey: 'higgsfield-ai/dop/standard',
        reason: expect.stringContaining('Not listed in the Higgsfield docs'),
        sourceUrl: 'https://docs.higgsfield.ai/docs/models.md',
      },
    ]);
    expect(
      first.updateMany.mock.calls[0]?.[0].data.providerSyncFailureCode,
    ).toBe(NOT_IN_CATALOG_CODE);

    const second = createWatcher({
      catalog: fullCatalog([]),
      rows: [registryRow({ providerSyncFailureCode: NOT_IN_CATALOG_CODE })],
    });

    expect(
      (await second.service.discoverModels()).report.removedByProvider,
    ).toEqual([]);
  });

  it('stays quiet about inactive rows, retired rows and the legacy endpoint spelling', async () => {
    const { service } = createWatcher({
      catalog: fullCatalog([]),
      rows: [
        registryRow({ id: 'inactive', isActive: false }),
        registryRow({ id: 'retired', lifecycle: ModelLifecycle.RETIRED }),
        registryRow({
          endpoint: 'higgsfiled/genjutsu/motion-transfer/v1.0',
          id: 'legacy',
          key: 'higgsfiled/genjutsu/motion-transfer/v1.0',
        }),
      ],
    });

    const summary = await service.discoverModels();

    expect(summary.report.removedByProvider).toEqual([]);
  });

  it('does not call a row removed when some catalog pages could not be read', async () => {
    const { service } = createWatcher({
      catalog: fullCatalog([], ['https://docs.higgsfield.ai/docs/models/x.md']),
      rows: [registryRow({})],
    });

    const summary = await service.discoverModels();

    expect(summary.report.removedByProvider).toEqual([]);
  });

  it('treats an implausibly small catalog as unreadable and drafts nothing', async () => {
    const { createDraftModel, dispatch, service } = createWatcher({
      catalog: {
        entries: [catalogEntry('only/one')],
        failedUrls: ['u1', 'u2'],
      },
      rows: [registryRow({})],
    });

    const summary = await service.discoverModels();

    expect(summary.errors).toBe(1);
    expect(summary.report.newDrafts).toEqual([]);
    expect(summary.report.removedByProvider).toEqual([]);
    expect(summary.report.unreadable).toEqual([
      {
        code: 'catalog_unreadable',
        modelKey: 'provider:higgsfield',
        reason: expect.stringContaining(
          'returned 1 endpoints (2 pages failed)',
        ),
      },
    ]);
    expect(createDraftModel).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('reports a provider-level failure when the scan throws', async () => {
    const { service } = createWatcher({
      catalog: new Error('network down'),
      rows: [],
    });

    const summary = await service.discoverModels();

    expect(summary.errors).toBe(1);
    expect(summary.report.unreadable[0]?.code).toBe('higgsfield_sync_failed');
  });

  it('posts no Discord card when nothing needs an operator', async () => {
    const { dispatch, service } = createWatcher({
      catalog: fullCatalog([]),
      rows: Array.from(
        { length: HIGGSFIELD_MIN_PLAUSIBLE_CATALOG_SIZE },
        (_, index) =>
          registryRow({
            endpoint: `filler/model-${index}`,
            id: `row-${index}`,
            key: `filler/model-${index}`,
          }),
      ),
    });

    await service.discoverModels();

    expect(dispatch).not.toHaveBeenCalled();
  });
});
