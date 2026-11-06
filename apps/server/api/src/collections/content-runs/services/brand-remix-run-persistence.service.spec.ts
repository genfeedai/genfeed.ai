import { isDeepStrictEqual } from 'node:util';
import { BrandRemixRunPersistenceService } from '@api/collections/content-runs/services/brand-remix-run-persistence.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentRunStatus } from '@genfeedai/contracts';
import { brandRemixRunConfigSchema } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

const config = brandRemixRunConfigSchema.parse({
  contract: 'brand-remix-run',
  draft: {
    fidelityMode: 'guided',
    identity: {},
    intent: { objective: 'Create an original brand execution.' },
    output: { aspectRatio: '1:1', count: 1, kind: 'image' },
    references: [],
    reviewRequired: true,
    target: { kind: 'organic', platform: 'instagram' },
  },
  phase: 'prefilled',
  readiness: { issues: [], state: 'ready' },
  recipeVersion: 1,
  revision: 1,
  sourceSnapshot: {
    capturedAt: '2026-08-20T10:00:00.000Z',
    evidence: ['hook'],
    metrics: {},
    pattern: { hook: 'Outcome-led relevance hook.' },
    platform: 'instagram',
    selector: { kind: 'source_post', sourcePostId: 'source-post-1' },
    sourceId: 'source-post-1',
    title: 'hook',
  },
  version: 1,
});

interface RunRow {
  brandId: string;
  config: Record<string, unknown>;
  createdAt: Date;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  status: ContentRunStatus;
  updatedAt: Date;
}

type Where = Record<string, unknown>;

function readPath(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>(
    (current, key) =>
      current && typeof current === 'object'
        ? (current as Record<string, unknown>)[key]
        : undefined,
    value,
  );
}

// Emulates the Prisma JSON filters this service uses: `equals` on the whole
// column or at a `path`, and case-insensitive `string_contains`.
function matchesJson(value: unknown, filter: Where): boolean {
  const target = filter.path ? readPath(value, filter.path as string[]) : value;
  if ('equals' in filter) {
    return isDeepStrictEqual(target, filter.equals);
  }
  return (
    typeof target === 'string' &&
    target.toLowerCase().includes(String(filter.string_contains).toLowerCase())
  );
}

/** Columns the database trigger copies out of `config` on every write. */
const PROMOTED_CONFIG_COLUMNS = new Set([
  'clientRequestId',
  'contract',
  'createdByUserId',
  'phase',
  'revision',
  'skillSlug',
]);

function matchesWhere(row: RunRow, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') {
      return (value as Where[]).every((branch) => matchesWhere(row, branch));
    }
    if (key === 'config') {
      return matchesJson(row.config, value as Where);
    }
    if (PROMOTED_CONFIG_COLUMNS.has(key)) {
      return row.config[key] === value;
    }
    return (row as unknown as Record<string, unknown>)[key] === value;
  });
}

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

describe('BrandRemixRunPersistenceService', () => {
  let runs: RunRow[];
  let transactions: number;
  let serializationFailures: number;
  let persistence: BrandRemixRunPersistenceService;

  function run(id: string, overrides: Partial<RunRow> = {}): RunRow {
    return {
      brandId: 'brand-1',
      config: json(config),
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      id,
      isDeleted: false,
      organizationId: 'org-1',
      status: ContentRunStatus.PENDING,
      updatedAt: new Date('2026-08-20T10:00:00.000Z'),
      ...overrides,
    };
  }

  function titled(title: string): Record<string, unknown> {
    return json({
      ...config,
      sourceSnapshot: { ...config.sourceSnapshot, title },
    });
  }

  beforeEach(() => {
    runs = [];
    transactions = 0;
    serializationFailures = 0;

    const contentRun = {
      create: async ({
        data,
      }: {
        data: Omit<RunRow, 'id' | 'createdAt' | 'updatedAt'>;
      }) => {
        if (serializationFailures > 0) {
          serializationFailures -= 1;
          throw { code: 'P2034' };
        }
        const now = new Date('2026-08-21T10:00:00.000Z');
        const row = {
          ...data,
          createdAt: now,
          id: `run-created-${runs.length + 1}`,
          updatedAt: now,
        } as RunRow;
        runs.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: Where }) =>
        runs
          .filter((row) => matchesWhere(row, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
        null,
      findMany: async ({
        skip,
        take,
        where,
      }: {
        skip: number;
        take: number;
        where: Where;
      }) =>
        runs
          .filter((row) => matchesWhere(row, where))
          .sort(
            (a, b) =>
              b.updatedAt.getTime() - a.updatedAt.getTime() ||
              b.id.localeCompare(a.id),
          )
          .slice(skip, skip + take),
      updateMany: async ({
        data,
        where,
      }: {
        data: Partial<RunRow>;
        where: Where;
      }) => {
        const matched = runs.filter((row) => matchesWhere(row, where));
        for (const row of matched) {
          Object.assign(row, data);
        }
        return { count: matched.length };
      },
    };
    const prisma = {
      $transaction: async (
        operation: (transaction: { contentRun: typeof contentRun }) => unknown,
      ) => {
        transactions += 1;
        return operation({ contentRun });
      },
      contentRun,
    };

    persistence = new BrandRemixRunPersistenceService(
      prisma as unknown as PrismaService,
    );
  });

  it('returns a run inside the tenant organization', async () => {
    runs = [run('run-1')];

    await expect(
      persistence.requireRun('org-1', 'run-1'),
    ).resolves.toMatchObject({ id: 'run-1', organizationId: 'org-1' });
  });

  it.each([
    ['another organization', { organizationId: 'org-2' }],
    ['a soft-deleted run', { isDeleted: true }],
    ['a run that is not a brand remix', { config: { contract: 'other' } }],
  ])('treats %s as not found', async (_label, overrides) => {
    runs = [run('run-1', overrides as Partial<RunRow>)];

    await expect(
      persistence.requireRun('org-1', 'run-1'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('lists the brand remix runs newest-edited first inside the tenant scope', async () => {
    runs = [
      run('run-old', { updatedAt: new Date('2026-08-01T00:00:00.000Z') }),
      run('run-new', { updatedAt: new Date('2026-08-03T00:00:00.000Z') }),
      run('run-mid', { updatedAt: new Date('2026-08-02T00:00:00.000Z') }),
      run('run-other-brand', { brandId: 'brand-2' }),
      run('run-other-org', { organizationId: 'org-2' }),
      run('run-deleted', { isDeleted: true }),
      run('run-not-remix', { config: { contract: 'other' } }),
    ];

    const firstPage = await persistence.listRuns('org-1', 'brand-1', {
      limit: 2,
      page: 1,
    });
    const secondPage = await persistence.listRuns('org-1', 'brand-1', {
      limit: 2,
      page: 2,
    });

    expect(firstPage.map((row) => row.id)).toEqual(['run-new', 'run-mid']);
    expect(secondPage.map((row) => row.id)).toEqual(['run-old']);
  });

  it('narrows the remix runs to titles that match the search', async () => {
    runs = [
      run('run-recap', { config: titled('Weekly RECAP hook') }),
      run('run-launch', { config: titled('Launch teaser') }),
    ];

    const matches = await persistence.listRuns('org-1', 'brand-1', {
      limit: 20,
      page: 1,
      search: 'recap',
    });

    expect(matches.map((row) => row.id)).toEqual(['run-recap']);
  });

  it('retries serializable reuse-or-create until the prefilled run settles', async () => {
    serializationFailures = 1;

    const persisted = await persistence.createOrReusePrefilledRun({
      brandId: 'brand-1',
      config,
      organizationId: 'org-1',
      selector: { kind: 'source_post', sourcePostId: 'source-post-1' },
    });

    expect(persisted.id).toBe('run-created-1');
    expect(transactions).toBe(2);
    expect(runs).toHaveLength(1);
  });

  it('surfaces the serialization failure once every retry is used', async () => {
    serializationFailures = 3;

    await expect(
      persistence.createOrReusePrefilledRun({
        brandId: 'brand-1',
        config,
        organizationId: 'org-1',
        selector: { kind: 'source_post', sourcePostId: 'source-post-1' },
      }),
    ).rejects.toEqual({ code: 'P2034' });
    expect(transactions).toBe(3);
    expect(runs).toEqual([]);
  });

  it('reuses the latest editable run for the same tenant-scoped selector', async () => {
    runs = [
      run('run-older', { createdAt: new Date('2026-08-19T10:00:00.000Z') }),
      run('run-existing'),
    ];

    const persisted = await persistence.createOrReusePrefilledRun({
      brandId: 'brand-1',
      config,
      organizationId: 'org-1',
      selector: { kind: 'source_post', sourcePostId: 'source-post-1' },
    });

    expect(persisted.id).toBe('run-existing');
    expect(runs).toHaveLength(2);
  });

  it('creates a new run instead of reusing one from another organization', async () => {
    runs = [run('run-foreign', { organizationId: 'org-2' })];

    const persisted = await persistence.createOrReusePrefilledRun({
      brandId: 'brand-1',
      config,
      organizationId: 'org-1',
      selector: { kind: 'source_post', sourcePostId: 'source-post-1' },
    });

    expect(persisted).toMatchObject({
      id: 'run-created-2',
      organizationId: 'org-1',
    });
    expect(runs).toHaveLength(2);
  });

  it('applies a compare-and-swap at the expected revision', async () => {
    runs = [run('run-1')];

    const updated = await persistence.compareAndSwapConfig({
      expectedPhase: 'prefilled',
      expectedRevision: 1,
      nextConfig: { ...config, revision: 2 },
      organizationId: 'org-1',
      runId: 'run-1',
      status: ContentRunStatus.PENDING,
    });

    expect(updated.config).toMatchObject({ revision: 2 });
    expect(runs[0]?.config).toMatchObject({ revision: 2 });
  });

  it('rejects a stale compare-and-swap without writing', async () => {
    runs = [run('run-1', { config: json({ ...config, revision: 3 }) })];

    await expect(
      persistence.compareAndSwapConfig({
        expectedPhase: 'prefilled',
        expectedRevision: 1,
        nextConfig: { ...config, revision: 2 },
        organizationId: 'org-1',
        runId: 'run-1',
        status: ContentRunStatus.PENDING,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(runs[0]?.config).toMatchObject({ revision: 3 });
  });

  it('swaps an exact config only while it is unchanged', async () => {
    runs = [run('run-1')];
    const next = { ...config, revision: 2 };

    await expect(
      persistence.compareAndSwapExactConfig({
        expectedConfig: config,
        nextConfig: next,
        organizationId: 'org-1',
        runId: 'run-1',
        status: ContentRunStatus.PENDING,
      }),
    ).resolves.toMatchObject({ id: 'run-1' });
    await expect(
      persistence.compareAndSwapExactConfig({
        expectedConfig: config,
        nextConfig: { ...config, revision: 3 },
        organizationId: 'org-1',
        runId: 'run-1',
        status: ContentRunStatus.PENDING,
      }),
    ).resolves.toBeNull();
    expect(runs[0]?.config).toMatchObject({ revision: 2 });
  });
});
