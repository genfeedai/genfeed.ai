import { ContextEmbeddingProviderService } from '@api/collections/contexts/services/context-embedding-provider.service';
import type { ContextEmbeddingWriteService } from '@api/collections/contexts/services/context-embedding-write.service';
import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { KnowledgeContentRetrievalService } from '@api/collections/contexts/services/knowledge-content-retrieval.service';
import type { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import type { RouterService } from '@api/services/router/router.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

interface MockSql {
  sql: string;
  values: unknown[];
}

/** Retrieval performs only one query embedding and read-only similarity work. */
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
    const embeddings = vi
      .fn()
      .mockResolvedValue({ data: [{ embedding: embeddingVector, index: 0 }] });
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    const prismaService = {
      $executeRaw: executeRaw,
      $queryRaw: queryRaw,
      $transaction: transaction,
      contextBase,
    } as unknown as PrismaService;

    const service = new ContextsService(
      prismaService,
      logger,
      new ContextEmbeddingProviderService(
        {
          getDefaultModel: vi.fn().mockResolvedValue('bge'),
        } as unknown as RouterService,
        { embeddings } as unknown as OpenRouterService,
      ),
      { write: vi.fn() } as unknown as ContextEmbeddingWriteService,
    );
    const retrieval = new KnowledgeContentRetrievalService(
      prismaService,
      service,
      brandAccessFixture(),
    );

    return {
      contextBase,
      embeddings,
      executeRaw,
      retrieval,
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

  it('performs one query embedding and no stored-entry provider or mutation work', async () => {
    const { service, embeddings, queryRaw, executeRaw } = buildService();
    await queryContext(service);
    expect(embeddings).toHaveBeenCalledExactlyOnceWith({
      input: 'find things',
      model: 'bge',
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect((queryRaw.mock.calls[0][0] as MockSql).sql).toContain(
      'FROM "context_entries" e',
    );
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect((executeRaw.mock.calls[0][0] as MockSql).sql).toContain(
      'hnsw.iterative_scan',
    );
    expect((executeRaw.mock.calls[0][0] as MockSql).sql).not.toContain(
      'UPDATE',
    );
  });

  it('does not mark saved entries failed when the request query embedding fails', async () => {
    const { service, embeddings, queryRaw, executeRaw } = buildService();
    embeddings.mockRejectedValue(new Error('provider rejected'));
    await expect(queryContext(service)).rejects.toThrow('provider rejected');
    expect(embeddings).toHaveBeenCalledTimes(1);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
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
    queryRaw.mockResolvedValueOnce([
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

  it('retrieves brand memory plus organization Knowledge and returns citations', async () => {
    const { retrieval, queryRaw, contextBase } = buildService();
    contextBase.findMany.mockResolvedValue([
      { data: { label: 'Voice' }, id: 'ctx-brand', sourceBrandId: 'brand-1' },
      {
        data: { knowledgeScope: 'org', purpose: 'knowledge-base' },
        id: 'ctx-org-knowledge',
        sourceBrandId: null,
      },
    ]);
    queryRaw.mockResolvedValueOnce([
      {
        content: 'Plans start at $29',
        contextBaseId: 'ctx-org-knowledge',
        kind: 'knowledge-source-chunk',
        knowledgeSourceId: 'source-1',
        knowledgeSourceKind: 'URL',
        knowledgeSourcePurpose: 'BRAND_TRUTH',
        knowledgeSourceTitle: 'Pricing page',
        knowledgeSourceUrl: 'https://brand.example/pricing',
        knowledgeSourceVersion: 2,
        knowledgeSourceVersionId: 'version-2',
        metadata: { chunkIndex: 0 },
        similarity: 0.91,
      },
      {
        content: 'Legacy winner',
        contextBaseId: 'ctx-brand',
        kind: 'performance_winner',
        knowledgeSourceId: null,
        knowledgeSourceKind: null,
        knowledgeSourcePurpose: null,
        knowledgeSourceTitle: null,
        knowledgeSourceUrl: null,
        knowledgeSourceVersion: null,
        knowledgeSourceVersionId: null,
        metadata: {},
        similarity: 0.8,
      },
    ]);

    const hits = await retrieval.retrieveBrandContentMemory({
      userId: 'user-1',
      brandId: 'brand-1',
      knowledgePurposes: ['BRAND_TRUTH'] as never,
      knowledgeSourceIds: ['source-1'],
      organizationId: 'org-1',
      query: 'pricing',
    });

    const baseWhere = contextBase.findMany.mock.calls[0]?.[0]?.where as {
      OR: unknown[];
    };
    expect(baseWhere.OR).toHaveLength(3);
    expect(baseWhere.OR[2]).toEqual({
      AND: [
        { sourceBrandId: null },
        { data: { equals: 'knowledge-base', path: ['purpose'] } },
        { data: { equals: 'org', path: ['knowledgeScope'] } },
      ],
    });
    const similarity = queryRaw.mock.calls[0]?.[0] as MockSql;
    expect(similarity.sql).toContain('e."knowledgeSourceId" IN (?)');
    expect(similarity.values).toEqual(
      expect.arrayContaining([
        'source-1',
        'BRAND_TRUTH',
        'ctx-brand',
        'ctx-org-knowledge',
      ]),
    );
    expect(hits).toEqual([
      {
        citation: {
          kind: 'URL',
          purpose: 'BRAND_TRUTH',
          sourceId: 'source-1',
          title: 'Pricing page',
          url: 'https://brand.example/pricing',
          version: 2,
          versionId: 'version-2',
        },
        content: 'Plans start at $29',
        kind: 'knowledge-source-chunk',
        metadata: { chunkIndex: 0 },
        relevance: 0.91,
        source: 'Pricing page',
      },
      {
        content: 'Legacy winner',
        kind: 'performance_winner',
        metadata: {},
        relevance: 0.8,
        source: 'Voice',
      },
    ]);
  });
});
