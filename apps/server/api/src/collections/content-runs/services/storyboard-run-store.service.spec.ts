import { StoryboardRunStoreService } from '@api/collections/content-runs/services/storyboard-run-store.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { StoryboardNativeRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { describe, expect, it, vi } from 'vitest';

const config: StoryboardNativeRunConfig = {
  origin: 'native',
  contract: 'storyboard-run',
  version: 1,
  revision: 1,
  state: 'storyboard',
  clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
  createdByUserId: 'user-1',
  submittedInputHash: 'a'.repeat(64),
  sourceSnapshot: {
    selector: { kind: 'brief', brief: 'A product video' },
    capturedAt: '2026-09-30T12:00:00.000Z',
  },
  plan: {
    title: '',
    logline: '',
    videoModelKey: null,
    format: '9:16',
    runtimeBudgetSeconds: 10,
    cast: [],
    styleReferenceAssetIds: [],
    shots: [],
  },
};
function setup() {
  const record = {
    id: 'run-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    config,
  };
  const contentRun = {
    findFirst: vi.fn(async () => record),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  return {
    record,
    contentRun,
    store: new StoryboardRunStoreService({
      contentRun,
    } as unknown as PrismaService),
  };
}
describe('Storyboard compare-and-swap storage', () => {
  it('every read scopes org, brand, live record, ID and canonical config family', async () => {
    const { store, contentRun } = setup();
    await store.read('org-1', 'brand-1', 'run-1', 1);
    expect(contentRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          brandId: 'brand-1',
          id: 'run-1',
          isDeleted: false,
          config: { path: ['contract'], equals: 'storyboard-run' },
        },
      }),
    );
    await expect(store.read('org-1', 'brand-1', 'run-1', 2)).rejects.toThrow(
      'current revision is 1',
    );
  });
  it('rejects a CAS loser without silently overwriting another editor', async () => {
    const { store, contentRun } = setup();
    contentRun.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      store.save('org-1', 'brand-1', 'run-1', config, {
        ...config,
        revision: 2,
      }),
    ).rejects.toThrow('changed during this save');
    expect(contentRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          brandId: 'brand-1',
          id: 'run-1',
          isDeleted: false,
          config: { equals: config },
        },
      }),
    );
  });
  it('returns the accepted revision even if a later editor commits before the read', async () => {
    const { store, contentRun, record } = setup();
    contentRun.findFirst.mockResolvedValue({
      ...record,
      config: { ...config, revision: 3 },
    });
    const saved = await store.save('org-1', 'brand-1', 'run-1', config, {
      ...config,
      revision: 2,
    });
    expect(saved.config.revision).toBe(2);
  });
  it('compares the exact read JSON when native defaults were absent in persisted config', async () => {
    const { store, contentRun, record } = setup();
    const { origin, ...raw } = config;
    contentRun.findFirst.mockResolvedValue({
      ...record,
      config: raw as typeof config,
    });
    const { config: previous } = await store.read('org-1', 'brand-1', 'run-1');
    await store.save('org-1', 'brand-1', 'run-1', previous, {
      ...previous,
      revision: 2,
    });
    expect(contentRun.findFirst).toHaveBeenCalledTimes(2);
    expect(contentRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ config: { equals: raw } }),
      }),
    );
  });
  it('cannot reuse a captured snapshot for another tenant or run', async () => {
    const { store, contentRun } = setup();
    const { config: previous } = await store.read('org-1', 'brand-1', 'run-1');
    await expect(
      store.save('other-org', 'brand-1', 'run-1', previous, {
        ...previous,
        revision: 2,
      }),
    ).rejects.toThrow('another run');
    expect(contentRun.updateMany).not.toHaveBeenCalled();
  });
});
