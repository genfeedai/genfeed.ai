vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import type { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import type { RouterService } from '@api/services/router/router.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

interface MockSql {
  sql: string;
  values: unknown[];
}

/**
 * Retrieval hot-path bounds (#2457). Empty content is failed in SQL; pending
 * rows are claimed with FOR UPDATE SKIP LOCKED; similarity runs inside a
 * transaction that enables hnsw.iterative_scan for small-tenant recall.
 */
describe('ContextsService retrieval hot path', () => {
  function buildService() {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const executeRaw = vi.fn().mockResolvedValue(1);
    const transaction = vi.fn(
      async (
        callback: (tx: {
          $executeRaw: typeof executeRaw;
          $queryRaw: typeof queryRaw;
        }) => Promise<unknown>,
      ) => callback({ $executeRaw: executeRaw, $queryRaw: queryRaw }),
    );
    const contextBase = {
      findFirst: vi.fn().mockResolvedValue({
        data: { isActive: true, label: 'Voice' },
        id: 'ctx-1',
        isDeleted: false,
        organizationId: 'org-1',
      }),
      findMany: vi.fn().mockResolvedValue([]),
    };

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
        $transaction: transaction,
        contextBase,
      } as unknown as PrismaService,
      logger,
      { generateEmbedding } as unknown as ReplicateService,
      {
        getDefaultModel: vi.fn().mockResolvedValue('bge'),
      } as unknown as RouterService,
    );

    return {
      contextBase,
      executeRaw,
      generateEmbedding,
      service,
      queryRaw,
      transaction,
    };
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

  it('fails empty-content rows then claims a SKIP LOCKED batch', async () => {
    const { service, queryRaw, executeRaw } = buildService();

    await queryContext(service);

    const emptyFail = executeRaw.mock.calls[0][0] as MockSql;
    expect(emptyFail.sql).toContain('SET "embeddingFailedAt" = NOW()');
    expect(emptyFail.sql).toContain(
      "NULLIF(BTRIM(\"data\"->>'content'), '') IS NULL",
    );

    const claim = queryRaw.mock.calls[0][0] as MockSql;
    expect(claim.sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(claim.sql).toContain('LIMIT ?');
    expect(claim.values).toContain(50);
  });

  it('persists embeddingFailedAt when the provider rejects a row', async () => {
    const { service, generateEmbedding, queryRaw, executeRaw } = buildService();
    queryRaw.mockResolvedValueOnce([
      { content: 'bad content', id: 'entry-broken' },
    ]);
    generateEmbedding
      .mockResolvedValueOnce(new Array(1024).fill(0.1))
      .mockRejectedValueOnce(new Error('provider rejected'));

    await queryContext(service);

    expect(generateEmbedding).toHaveBeenCalledWith('bge', 'bad content');
    const failWrite = executeRaw.mock.calls.find((call) => {
      const sql = (call[0] as MockSql).sql;
      return (
        sql.includes('"embeddingFailedAt" = NOW()') &&
        sql.includes('"embeddingClaimedAt" = NULL')
      );
    });
    expect(failWrite).toBeDefined();
    if (!failWrite) {
      throw new Error('expected embeddingFailedAt write');
    }
    expect((failWrite[0] as MockSql).values).toContain('entry-broken');
  });

  it('runs similarity inside a transaction that enables iterative_scan', async () => {
    const { service, executeRaw, transaction } = buildService();

    await queryContext(service);

    expect(transaction).toHaveBeenCalledTimes(1);
    const iterativeScan = executeRaw.mock.calls.find((call) =>
      (call[0] as MockSql).sql.includes('hnsw.iterative_scan'),
    );
    expect(iterativeScan).toBeDefined();
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
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { content: 'match', contextBaseId: 'ctx-1', similarity: 0.9 },
      ]);

    await service.enhancePrompt({ prompt: 'write a post' } as never, 'org-1');

    const jsonbSet = executeRaw.mock.calls.find((call) =>
      (call[0] as MockSql).sql.includes('jsonb_set'),
    );
    expect(jsonbSet).toBeDefined();
    const statement = jsonbSet?.[0] as MockSql;
    expect(statement.sql).toContain('GREATEST');
    expect(statement.values).toEqual(
      expect.arrayContaining(['usageCount', 'org-1', 1, 'ctx-1', 'ctx-2']),
    );
  });
});
