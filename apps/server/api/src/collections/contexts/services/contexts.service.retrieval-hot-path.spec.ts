vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import type { RouterService } from '@api/services/router/router.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

interface MockSql {
  sql: string;
  values: unknown[];
}

/**
 * Retrieval hot-path bounds. The lazy embedding backfill inside
 * findSimilarEntries used to load every pending row (no LIMIT) and retry
 * permanently failing rows on each request; JSONB usage counters were
 * read-modify-write per base. These lock in the LIMIT, the per-process
 * failed-id exclusion, and the single atomic counter statement.
 */
describe('ContextsService retrieval hot path', () => {
  function buildService() {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const executeRaw = vi.fn().mockResolvedValue(1);
    const contextBase = {
      findFirst: vi.fn().mockResolvedValue({
        data: { isActive: true, label: 'Voice' },
        id: 'ctx-1',
        isDeleted: false,
        organizationId: 'org-1',
      }),
      findMany: vi.fn().mockResolvedValue([]),
    };

    // buildContextSimilarityQuery validates the pgvector dimension.
    const embeddingVector = new Array(1024).fill(0.1);
    const generateEmbedding = vi.fn().mockResolvedValue(embeddingVector);
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    const service = new ContextsService(
      {
        $executeRaw: executeRaw,
        $queryRaw: queryRaw,
        contextBase,
      } as unknown as PrismaService,
      logger,
      { generateEmbedding } as unknown as ReplicateService,
      {
        getDefaultModel: vi.fn().mockResolvedValue('bge'),
      } as unknown as RouterService,
    );

    return { contextBase, executeRaw, generateEmbedding, service, queryRaw };
  }

  function queryContext(service: ContextsService) {
    return service.queryContext(
      { contextBaseId: 'ctx-1', query: 'find things' },
      'org-1',
    );
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('bounds the lazy re-embedding sweep to 50 rows per request', async () => {
    const { service, queryRaw } = buildService();

    await queryContext(service);

    // First raw query is the pending-embeddings sweep; the similarity query
    // follows. The LIMIT is a bound parameter.
    const pendingSweep = queryRaw.mock.calls[0][0] as MockSql;
    expect(pendingSweep.sql).toContain('LIMIT');
    expect(pendingSweep.sql).toContain('ORDER BY "createdAt" ASC');
    expect(pendingSweep.values).toContain(50);
  });

  it('stops retrying an entry that failed to embed in this process run', async () => {
    const { service, generateEmbedding, queryRaw } = buildService();
    queryRaw
      // Request 1: sweep returns one pending row, similarity returns nothing.
      .mockResolvedValueOnce([{ content: 'bad content', id: 'entry-broken' }])
      .mockResolvedValueOnce([])
      // Request 2: sweep + similarity.
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    generateEmbedding.mockImplementation((_model: string, text: string) =>
      text === 'bad content'
        ? Promise.reject(new Error('provider rejected'))
        : Promise.resolve(new Array(1024).fill(0.1)),
    );

    await queryContext(service);
    expect(generateEmbedding).toHaveBeenCalledWith('bge', 'bad content');

    await queryContext(service);

    // The second sweep excludes the failed id at the SQL level.
    const secondSweep = queryRaw.mock.calls[2][0] as MockSql;
    expect(secondSweep.sql).toContain('NOT IN');
    expect(secondSweep.values).toContain('entry-broken');
  });

  it('increments usage counters with one atomic jsonb_set statement', async () => {
    const { service, executeRaw, queryRaw, contextBase } = buildService();
    contextBase.findMany.mockResolvedValue([
      {
        data: { isActive: true, label: 'A' },
        id: 'ctx-1',
        organizationId: 'org-1',
      },
      {
        data: { isActive: true, label: 'B' },
        id: 'ctx-2',
        organizationId: 'org-1',
      },
    ]);
    queryRaw
      // Pending-embeddings sweep, then similarity rows.
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { content: 'match', contextBaseId: 'ctx-1', similarity: 0.9 },
      ]);

    await service.enhancePrompt({ prompt: 'write a post' } as never, 'org-1');

    expect(executeRaw).toHaveBeenCalledTimes(1);
    const statement = executeRaw.mock.calls[0][0] as MockSql;
    expect(statement.sql).toContain('jsonb_set');
    expect(statement.sql).toContain('GREATEST');
    expect(statement.values).toEqual(
      expect.arrayContaining(['usageCount', 'org-1', 1, 'ctx-1', 'ctx-2']),
    );
  });
});
