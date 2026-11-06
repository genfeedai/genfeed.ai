import { isDeepStrictEqual } from 'node:util';
import { StoryboardRunStoreService } from '@api/collections/content-runs/services/storyboard-run-store.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { StoryboardNativeRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { describe, expect, it } from 'vitest';

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
type ContentRunRow = {
  brandId: string;
  config: unknown;
  createdAt: Date;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  status?: string;
  updatedAt: Date;
};
type ConfigWhere = { equals: unknown; path?: string[] };

function configMatches(config: unknown, where: ConfigWhere): boolean {
  if (where.path) {
    const [key] = where.path;
    return (config as Record<string, unknown>)[key] === where.equals;
  }
  return isDeepStrictEqual(config, where.equals);
}

function rowMatches(row: ContentRunRow, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, value]) =>
    key === 'config'
      ? configMatches(row.config, value as ConfigWhere)
      : row[key as keyof ContentRunRow] === value,
  );
}

/**
 * In-memory content_runs table with Prisma's JSON `equals` semantics, so the
 * compare-and-swap is decided by what is stored. `afterUpdate` lets a test
 * commit a concurrent editor's change right after a save lands.
 */
function setup(storedConfig: unknown = config) {
  const rows: ContentRunRow[] = [
    {
      brandId: 'brand-1',
      config: storedConfig,
      createdAt: new Date(),
      id: 'run-1',
      isDeleted: false,
      organizationId: 'org-1',
      updatedAt: new Date(),
    },
  ];
  const hooks: { afterUpdate: () => void } = { afterUpdate: () => undefined };
  const contentRun = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((row) => rowMatches(row, where)) ?? null,
    updateMany: async ({
      data,
      where,
    }: {
      data: Partial<ContentRunRow>;
      where: Record<string, unknown>;
    }) => {
      const targets = rows.filter((row) => rowMatches(row, where));
      for (const row of targets) Object.assign(row, data);
      if (targets.length > 0) hooks.afterUpdate();
      return { count: targets.length };
    },
  };
  return {
    hooks,
    row: rows[0],
    store: new StoryboardRunStoreService({
      contentRun,
    } as unknown as PrismaService),
  };
}

describe('Storyboard compare-and-swap storage', () => {
  it('every read scopes org, brand, live record, ID and canonical config family', async () => {
    const { row, store } = setup();
    await expect(
      store.read('org-1', 'brand-1', 'run-1', 1),
    ).resolves.toMatchObject({
      config: { revision: 1 },
    });
    await expect(store.read('org-2', 'brand-1', 'run-1')).rejects.toThrow(
      'not found',
    );
    await expect(store.read('org-1', 'brand-2', 'run-1')).rejects.toThrow(
      'not found',
    );
    await expect(store.read('org-1', 'brand-1', 'run-2')).rejects.toThrow(
      'not found',
    );
    await expect(store.read('org-1', 'brand-1', 'run-1', 2)).rejects.toThrow(
      'current revision is 1',
    );
    row.config = { ...config, contract: 'brand-remix-run' };
    await expect(store.read('org-1', 'brand-1', 'run-1')).rejects.toThrow(
      'not found',
    );
    row.config = config;
    row.isDeleted = true;
    await expect(store.read('org-1', 'brand-1', 'run-1')).rejects.toThrow(
      'not found',
    );
  });

  it('rejects a CAS loser without silently overwriting another editor', async () => {
    const { row, store } = setup();
    const { config: previous } = await store.read('org-1', 'brand-1', 'run-1');
    const otherEditor = {
      ...config,
      revision: 2,
      plan: { ...config.plan, title: 'Theirs' },
    };
    row.config = otherEditor;

    await expect(
      store.save('org-1', 'brand-1', 'run-1', previous, {
        ...previous,
        revision: 2,
      }),
    ).rejects.toThrow('changed during this save');
    expect(row.config).toEqual(otherEditor);
  });

  it('returns the accepted revision even if a later editor commits before the read', async () => {
    const { hooks, row, store } = setup();
    const { config: previous } = await store.read('org-1', 'brand-1', 'run-1');
    hooks.afterUpdate = () => {
      row.config = { ...config, revision: 3 };
    };
    const saved = await store.save('org-1', 'brand-1', 'run-1', previous, {
      ...previous,
      revision: 2,
    });
    expect(saved.config.revision).toBe(2);
  });

  it('compares the exact read JSON when native defaults were absent in persisted config', async () => {
    const { origin, ...raw } = config;
    const { row, store } = setup(raw);
    const { config: previous } = await store.read('org-1', 'brand-1', 'run-1');
    const saved = await store.save('org-1', 'brand-1', 'run-1', previous, {
      ...previous,
      revision: 2,
    });
    expect(saved.config.revision).toBe(2);
    expect(row.config).toMatchObject({ revision: 2 });
  });

  it('does not save a run deleted after its snapshot was read', async () => {
    const { row, store } = setup();
    const { config: previous } = await store.read('org-1', 'brand-1', 'run-1');
    row.isDeleted = true;

    await expect(
      store.save('org-1', 'brand-1', 'run-1', previous, {
        ...previous,
        revision: 2,
      }),
    ).rejects.toThrow('changed during this save');
    expect(row.config).toEqual(config);
    expect(row.status).toBeUndefined();
  });

  it('cannot reuse a captured snapshot for another tenant or run', async () => {
    const { row, store } = setup();
    const { config: previous } = await store.read('org-1', 'brand-1', 'run-1');
    await expect(
      store.save('other-org', 'brand-1', 'run-1', previous, {
        ...previous,
        revision: 2,
      }),
    ).rejects.toThrow('another run');
    expect(row.config).toEqual(config);
  });
});
