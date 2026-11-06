import { ContextEmbeddingProviderService } from '@api/collections/contexts/services/context-embedding-provider.service';
import type { ContextEmbeddingWriteService } from '@api/collections/contexts/services/context-embedding-write.service';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import type { RouterService } from '@api/services/router/router.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { MockSql } from '@api/shared/testing/prisma-mock';
import type { LoggerService } from '@libs/logger/logger.service';

type Row = Record<string, unknown> & { id: string };
type Where = Record<string, unknown>;

interface Tables {
  contextBase: Row[];
  contextEmbeddingJob: Row[];
  contextEntry: Row[];
}

/**
 * Prisma `where` over scalars, `AND`, `{ in }`, JSON `{ path, equals }` and
 * `{ path, string_contains, mode: 'insensitive' }`, and the embedding job's
 * `contextEntry: { is }` relation.
 */
function matches(tables: Tables, row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') {
      return (value as Where[]).every((clause) => matches(tables, row, clause));
    }
    if (key === 'contextEntry') {
      const entry = tables.contextEntry.find(
        (item) => item.id === row.contextEntryId,
      );
      return !!entry && matches(tables, entry, (value as { is: Where }).is);
    }
    if (value !== null && typeof value === 'object') {
      const filter = value as Record<string, unknown>;
      if ('in' in filter) return (filter.in as unknown[]).includes(row[key]);
      if ('path' in filter) {
        const field = (row[key] as Record<string, unknown> | undefined)?.[
          (filter.path as string[])[0]
        ];
        if ('equals' in filter) return field === filter.equals;
        return String(field ?? '')
          .toLowerCase()
          .includes(String(filter.string_contains).toLowerCase());
      }
    }
    return row[key] === value;
  });
}

/** Prisma `data` with scalar sets and `{ increment }`. */
function apply(row: Row, data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    row[key] =
      value !== null && typeof value === 'object' && 'increment' in value
        ? ((row[key] as number | undefined) ?? 0) +
          (value as { increment: number }).increment
        : value;
  }
}

/**
 * In-memory context bases, entries and embedding jobs behind a transactional
 * Prisma client. The entry-count raw update is applied to the base it names.
 */
function buildService(seed: Partial<Tables> = {}) {
  const tables: Tables = {
    contextBase: seed.contextBase ?? [],
    contextEmbeddingJob: seed.contextEmbeddingJob ?? [],
    contextEntry: seed.contextEntry ?? [],
  };
  const delegate = (rows: Row[]) => ({
    count: async ({ where }: { where: Where }) =>
      rows.filter((row) => matches(tables, row, where)).length,
    findFirst: async ({ where }: { where: Where }) =>
      rows.find((row) => matches(tables, row, where)) ?? null,
    findMany: async ({
      skip,
      take,
      where,
    }: {
      skip: number;
      take: number;
      where: Where;
    }) =>
      rows
        .filter((row) => matches(tables, row, where))
        .sort((a, b) => (b.createdAt as number) - (a.createdAt as number))
        .slice(skip, skip + take),
    update: async ({
      data,
      where,
    }: {
      data: Record<string, unknown>;
      where: Where;
    }) => {
      const row = rows.find((item) => matches(tables, item, where));
      if (!row) throw new Error('Record to update not found.');
      apply(row, data);
      return { ...row };
    },
    updateMany: async ({
      data,
      where,
    }: {
      data: Record<string, unknown>;
      where: Where;
    }) => {
      const hit = rows.filter((row) => matches(tables, row, where));
      for (const row of hit) apply(row, data);
      return { count: hit.length };
    },
  });
  const tx = {
    $executeRaw: async (query: MockSql) => {
      const [baseId, organizationId] = query.values;
      const base = tables.contextBase.find(
        (row) =>
          row.id === baseId &&
          row.organizationId === organizationId &&
          row.isDeleted === false,
      );
      if (base && query.sql.includes('entryCount')) {
        const data = base.data as Record<string, number>;
        base.data = {
          ...data,
          entryCount: Math.max(0, (data.entryCount ?? 0) - 1),
        };
      }
      return base ? 1 : 0;
    },
    $queryRaw: async () => [],
    contextBase: delegate(tables.contextBase),
    contextEmbeddingJob: delegate(tables.contextEmbeddingJob),
    contextEntry: delegate(tables.contextEntry),
  };
  const prisma = {
    ...tx,
    $transaction: async (work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
  };
  const silent = () => undefined;
  const service = new ContextsService(
    prisma as unknown as PrismaService,
    {
      debug: silent,
      error: silent,
      log: silent,
      warn: silent,
    } as unknown as LoggerService,
    new ContextEmbeddingProviderService(
      {} as unknown as RouterService,
      {} as unknown as OpenRouterService,
    ),
    {} as unknown as ContextEmbeddingWriteService,
  );
  return { service, tables };
}

const base = (overrides: Partial<Row> = {}): Row => ({
  createdAt: 1,
  data: { label: 'Voice' },
  id: 'ctx-1',
  isDeleted: false,
  organizationId: 'org-1',
  ...overrides,
});

const entry = (overrides: Partial<Row> = {}): Row => ({
  contextBaseId: 'ctx-1',
  embeddingGeneration: 0,
  id: 'entry-1',
  isDeleted: false,
  organizationId: 'org-1',
  ...overrides,
});

const job = (overrides: Partial<Row> = {}): Row => ({
  contextEntryId: 'entry-1',
  id: 'job-1',
  isDeleted: false,
  leaseToken: 'lease',
  organizationId: 'org-1',
  status: 'PENDING',
  ...overrides,
});

async function notFound(work: Promise<unknown>) {
  const failure = await work.catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(NotFoundException);
  return (failure as NotFoundException).getResponse();
}

describe('ContextsService — tenant-scoped fetch or 404', () => {
  it('findOne returns the context base of the caller organization', async () => {
    const { service } = buildService({ contextBase: [base()] });

    await expect(service.findOne('ctx-1', 'org-1')).resolves.toMatchObject({
      id: 'ctx-1',
      organizationId: 'org-1',
    });
  });

  it.each([
    ['in another organization', base(), 'org-2'],
    ['soft-deleted', base({ isDeleted: true }), 'org-1'],
  ])('findOne 404s for a base that is %s', async (_name, row, org) => {
    const { service } = buildService({ contextBase: [row] });

    await notFound(service.findOne('ctx-1', org));
  });

  it('findOne keeps the canonical JSON:API 404 shape (no identifier form)', async () => {
    const { service } = buildService();

    await expect(
      notFound(service.findOne('missing', 'org-1')),
    ).resolves.toEqual({
      detail: 'Context base not found',
      title: 'Resource Not Found',
    });
  });

  it('remove soft-deletes the base and its live entries and cancels their pending embeddings', async () => {
    const { service, tables } = buildService({
      contextBase: [base()],
      contextEmbeddingJob: [
        job(),
        job({ id: 'job-done', status: 'COMPLETED' }),
      ],
      contextEntry: [
        entry(),
        entry({ id: 'entry-other-base', contextBaseId: 'ctx-2' }),
      ],
    });

    await service.remove('ctx-1', 'org-1');

    expect(tables.contextBase[0].isDeleted).toBe(true);
    expect(tables.contextEntry).toEqual([
      expect.objectContaining({
        embeddingGeneration: 1,
        id: 'entry-1',
        isDeleted: true,
      }),
      expect.objectContaining({ id: 'entry-other-base', isDeleted: false }),
    ]);
    expect(tables.contextEmbeddingJob).toEqual([
      expect.objectContaining({
        id: 'job-1',
        leaseToken: null,
        safeFailureCode: 'SOURCE_RETIRED',
        status: 'CANCELLED',
      }),
      expect.objectContaining({ id: 'job-done', status: 'COMPLETED' }),
    ]);
  });

  it('remove 404s for another organization and changes nothing', async () => {
    const { service, tables } = buildService({
      contextBase: [base()],
      contextEntry: [entry()],
    });

    await notFound(service.remove('ctx-1', 'org-2'));
    expect(tables.contextBase[0].isDeleted).toBe(false);
    expect(tables.contextEntry[0].isDeleted).toBe(false);
  });

  it('removeEntry soft-deletes the entry, cancels its embedding and decrements the count', async () => {
    const { service, tables } = buildService({
      contextBase: [base({ data: { entryCount: 5 } })],
      contextEmbeddingJob: [job()],
      contextEntry: [entry(), entry({ id: 'entry-2' })],
    });

    await service.removeEntry('ctx-1', 'entry-1', 'org-1');

    expect(tables.contextEntry).toEqual([
      expect.objectContaining({
        embeddingGeneration: 1,
        id: 'entry-1',
        isDeleted: true,
      }),
      expect.objectContaining({ id: 'entry-2', isDeleted: false }),
    ]);
    expect(tables.contextEmbeddingJob[0].status).toBe('CANCELLED');
    expect(tables.contextBase[0].data).toEqual({ entryCount: 4 });
  });

  it('removeEntry 404s with the Entry resource for another organization and changes nothing', async () => {
    const { service, tables } = buildService({
      contextBase: [base({ data: { entryCount: 5 } })],
      contextEntry: [entry()],
    });

    await expect(
      notFound(service.removeEntry('ctx-1', 'entry-1', 'org-2')),
    ).resolves.toEqual({
      detail: 'Entry not found',
      title: 'Resource Not Found',
    });
    expect(tables.contextEntry[0].isDeleted).toBe(false);
    expect(tables.contextBase[0].data).toEqual({ entryCount: 5 });
  });
});

describe('ContextsService.findAll', () => {
  const pageOfBases = Array.from({ length: 45 }, (_, index) =>
    base({ createdAt: index, id: `ctx-${index}` }),
  );

  it('pages newest first and counts every matching base', async () => {
    const { service } = buildService({
      contextBase: [
        ...pageOfBases,
        base({ id: 'ctx-deleted', isDeleted: true }),
        base({ id: 'ctx-other-org', organizationId: 'org-2' }),
      ],
    });

    const result = await service.findAll('org-1', {}, { limit: 20, page: 3 });

    expect(result).toMatchObject({
      hasNextPage: false,
      limit: 20,
      page: 3,
      totalDocs: 45,
      totalPages: 3,
    });
    expect(result.docs).toEqual([
      expect.objectContaining({ id: 'ctx-4' }),
      expect.objectContaining({ id: 'ctx-3' }),
      expect.objectContaining({ id: 'ctx-2' }),
      expect.objectContaining({ id: 'ctx-1' }),
      expect.objectContaining({ id: 'ctx-0' }),
    ]);
  });

  it('filters by category, active flag, label search and source brand', async () => {
    const match = {
      category: 'content_library',
      isActive: true,
      label: 'Brand Voice',
    };
    const { service } = buildService({
      contextBase: [
        base({ data: match, id: 'hit', sourceBrandId: 'brand-1' }),
        base({
          data: { ...match, category: 'other' },
          id: 'wrong-category',
          sourceBrandId: 'brand-1',
        }),
        base({
          data: { ...match, isActive: false },
          id: 'inactive',
          sourceBrandId: 'brand-1',
        }),
        base({
          data: { ...match, label: 'Pricing' },
          id: 'no-search-hit',
          sourceBrandId: 'brand-1',
        }),
        base({ data: match, id: 'other-brand', sourceBrandId: 'brand-2' }),
      ],
    });

    const result = await service.findAll(
      'org-1',
      {
        category: 'content_library',
        isActive: true,
        search: 'voice',
        sourceBrandId: 'brand-1',
      },
      { limit: 10, page: 1 },
    );

    expect(result).toMatchObject({ docs: [{ id: 'hit' }], totalDocs: 1 });
  });
});
