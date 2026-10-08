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
import type { MockSql } from '@api/shared/testing/prisma-mock';
import type { LoggerService } from '@libs/logger/logger.service';

const BRAND_A = 'brand-a';
const BRAND_B = 'brand-b';

function knowledgeRow(
  overrides: Partial<{
    content: string;
    contextBaseId: string;
    knowledgeSourceId: string;
    knowledgeSourcePurpose: string;
    knowledgeSourceTitle: string;
    similarity: number;
  }> = {},
) {
  return {
    content: 'Plans start at $29',
    contextBaseId: 'ctx-knowledge-a',
    kind: 'knowledge-source-chunk',
    knowledgeSourceId: 'source-truth',
    knowledgeSourceKind: 'URL',
    knowledgeSourcePurpose: 'BRAND_TRUTH',
    knowledgeSourceTitle: 'Pricing page',
    knowledgeSourceUrl: 'https://brand.example/pricing',
    knowledgeSourceVersion: 1,
    knowledgeSourceVersionId: `${overrides.knowledgeSourceId ?? 'source-truth'}-v1`,
    metadata: {},
    similarity: 0.9,
    ...overrides,
  };
}

/**
 * Brand isolation of retrieval: in a multi-brand organization one brand's
 * saved memory and Knowledge must never reach another brand's prompt.
 * `KnowledgeContentRetrievalService` drives its similarity searches through
 * `ContextsService.generateEmbedding` / `findSimilarEntries`, so both are
 * built here sharing one mocked `PrismaService` (#5144 follow-up split).
 */
describe('KnowledgeContentRetrievalService', () => {
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
      findFirst: vi.fn(),
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

    const contextsService = new ContextsService(
      prismaService,
      logger,
      { embeddings } as unknown as OpenRouterService,
      {
        getDefaultModel: vi.fn().mockResolvedValue('bge'),
      } as unknown as RouterService,
    );

    const service = new KnowledgeContentRetrievalService(
      prismaService,
      contextsService,
      brandAccessFixture(),
    );

    return { contextBase, embeddings, queryRaw, service };
  }

  /** The similarity statement is the last raw query (after the embed claim). */
  function lastSimilarityQuery(queryRaw: ReturnType<typeof vi.fn>): MockSql {
    const call = queryRaw.mock.calls.at(-1);
    if (!call) {
      throw new Error('expected a similarity query');
    }
    return call[0] as MockSql;
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('retrieveBrandContentMemory', () => {
    it('returns nothing without a brand instead of an unscoped read', async () => {
      const { contextBase, service } = buildService();

      const hits = await service.retrieveBrandContentMemory({
        userId: 'user-a',
        brandId: '  ',
        organizationId: 'org-1',
        query: 'pricing',
      });

      expect(hits).toEqual([]);
      expect(contextBase.findMany).not.toHaveBeenCalled();
    });

    it('returns nothing for an explicit selection that resolved to no sources', async () => {
      const { contextBase, service } = buildService();

      const hits = await service.retrieveBrandContentMemory({
        userId: 'user-a',
        brandId: BRAND_A,
        knowledgeSourceIds: [],
        organizationId: 'org-1',
        query: 'pricing',
      });

      expect(hits).toEqual([]);
      expect(contextBase.findMany).not.toHaveBeenCalled();
    });

    it('drops bases owned by another brand and restricts Knowledge to the brand', async () => {
      const { contextBase, queryRaw, service } = buildService();
      contextBase.findMany.mockResolvedValue([
        { data: { label: 'A' }, id: 'ctx-a', sourceBrandId: BRAND_A },
        {
          data: { brandId: BRAND_B, label: 'B' },
          id: 'ctx-b-legacy',
          sourceBrandId: BRAND_A,
        },
      ]);

      await service.retrieveBrandContentMemory({
        userId: 'user-a',
        brandId: BRAND_A,
        organizationId: 'org-1',
        query: 'pricing',
      });

      const similarity = lastSimilarityQuery(queryRaw);
      expect(similarity.values).toContain('ctx-a');
      expect(similarity.values).not.toContain('ctx-b-legacy');
      expect(similarity.sql).toContain('AND s."brandId" = ?');
      expect(similarity.values).toContain(BRAND_A);
    });

    it('passes isKnowledgeOnly through so uncited legacy chunks never take a result slot', async () => {
      const { contextBase, queryRaw, service } = buildService();
      contextBase.findMany.mockResolvedValue([
        { data: { label: 'A' }, id: 'ctx-a', sourceBrandId: BRAND_A },
      ]);

      await service.retrieveBrandContentMemory({
        userId: 'user-a',
        brandId: BRAND_A,
        isKnowledgeOnly: true,
        organizationId: 'org-1',
        query: 'pricing',
      });

      const similarity = lastSimilarityQuery(queryRaw);
      expect(similarity.sql).toContain('AND e."knowledgeSourceId" IS NOT NULL');
    });

    it('omits the Knowledge-only filter by default, keeping uncited legacy chunks eligible', async () => {
      const { contextBase, queryRaw, service } = buildService();
      contextBase.findMany.mockResolvedValue([
        { data: { label: 'A' }, id: 'ctx-a', sourceBrandId: BRAND_A },
      ]);

      await service.retrieveBrandContentMemory({
        userId: 'user-a',
        brandId: BRAND_A,
        organizationId: 'org-1',
        query: 'pricing',
      });

      const similarity = lastSimilarityQuery(queryRaw);
      expect(similarity.sql).not.toContain(
        'AND e."knowledgeSourceId" IS NOT NULL',
      );
    });
  });

  describe('retrieveSelectedBrandContentMemory', () => {
    const params = {
      userId: 'user-a',
      brandId: BRAND_A,
      organizationId: 'org-1',
      query: 'pricing',
    };
    const base = {
      data: { knowledgeScope: 'brand', purpose: 'knowledge-base' },
      id: 'ctx-knowledge-a',
      sourceBrandId: BRAND_A,
    };

    it.each([1, 2, 3, 4, 5, 6, 7, 8])(
      'shares one embedding across %s bounded source queries',
      async (count) => {
        const { contextBase, embeddings, queryRaw, service } = buildService();
        contextBase.findMany.mockResolvedValue([base]);
        const sourceIds = Array.from(
          { length: count },
          (_, index) => `source-${index}`,
        );
        const quotas = sourceIds.map(
          (_, index) => Math.floor(8 / count) + (index < 8 % count ? 1 : 0),
        );
        for (const [index, sourceId] of sourceIds.entries()) {
          queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce(
            Array.from({ length: quotas[index] }, () =>
              knowledgeRow({
                knowledgeSourceId: sourceId,
                similarity: index ? 0.1 : 0.99,
              }),
            ),
          );
        }
        const hits = await service.retrieveSelectedBrandContentMemory(
          {
            userId: 'user-a',
            ...params,
            limit: 999,
            minRelevance: 1,
            knowledgeSourceIds: ['ignored'],
          },
          sourceIds,
        );
        expect(contextBase.findMany).toHaveBeenCalledTimes(1);
        expect(embeddings).toHaveBeenCalledTimes(1);
        expect(hits).toHaveLength(8);
        expect(
          sourceIds.map(
            (sourceId) =>
              hits.filter((hit) => hit.citation?.sourceId === sourceId).length,
          ),
        ).toEqual(quotas);
        const statements = queryRaw.mock.calls
          .filter((_, index) => index % 2 === 1)
          .map(([statement]) => statement as MockSql);
        expect(statements).toHaveLength(count);
        for (const [index, statement] of statements.entries()) {
          expect(statement.values).toContain(sourceIds[index]);
          expect(statement.values).not.toContain('ignored');
          expect(statement.values).toContain('org-1');
          expect(statement.values).toContain(BRAND_A);
          expect(statement.sql).toContain(
            'AND e."knowledgeSourceId" IS NOT NULL',
          );
          expect(statement.sql).toContain('AND s."brandId" = ?');
          expect(statement.sql).toContain('"isDeleted"');
        }
      },
    );

    it('does not share vectors or scoped bases between requests', async () => {
      const { contextBase, embeddings, queryRaw, service } = buildService();
      contextBase.findMany.mockResolvedValue([base]);
      for (let index = 0; index < 2; index++)
        queryRaw
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([knowledgeRow()]);
      await service.retrieveSelectedBrandContentMemory(params, [
        'source-truth',
      ]);
      await service.retrieveSelectedBrandContentMemory(
        {
          userId: 'user-a',
          ...params,
          query: 'different query',
          organizationId: 'org-2',
        },
        ['source-truth'],
      );
      expect(embeddings).toHaveBeenCalledTimes(2);
      expect(contextBase.findMany).toHaveBeenCalledTimes(2);
      expect(lastSimilarityQuery(queryRaw).values).toContain('org-2');
      expect(lastSimilarityQuery(queryRaw).values).not.toContain('org-1');
    });

    it.each(
      [[], ['duplicate', 'duplicate'], [' '], Array(9).fill('source')].map(
        (sourceIds) => ({ sourceIds }),
      ),
    )(
      'rejects invalid selection %j before database or embedding work',
      async ({ sourceIds }) => {
        const { contextBase, embeddings, service } = buildService();
        await expect(
          service.retrieveSelectedBrandContentMemory(params, sourceIds),
        ).rejects.toThrow('knowledge_unavailable');
        expect(contextBase.findMany).not.toHaveBeenCalled();
        expect(embeddings).not.toHaveBeenCalled();
      },
    );

    it.each(['query', 'brand', 'bases'])(
      'rejects missing %s before any embedding',
      async (kind) => {
        const { contextBase, embeddings, service } = buildService();
        contextBase.findMany.mockResolvedValue([
          { ...base, sourceBrandId: BRAND_B },
        ]);
        await expect(
          service.retrieveSelectedBrandContentMemory(
            {
              userId: 'user-a',
              ...params,
              ...(kind === 'query' ? { query: ' ' } : {}),
              ...(kind === 'brand' ? { brandId: ' ' } : {}),
            },
            ['source-truth'],
          ),
        ).rejects.toThrow('knowledge_unavailable');
        expect(embeddings).not.toHaveBeenCalled();
      },
    );

    it.each(['empty', 'foreign', 'overquota'])(
      'fails closed on %s passages without another embedding or fallback',
      async (kind) => {
        const { contextBase, embeddings, queryRaw, service } = buildService();
        contextBase.findMany.mockResolvedValue([base]);
        queryRaw
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce(
            kind === 'empty'
              ? []
              : kind === 'foreign'
                ? [knowledgeRow({ knowledgeSourceId: 'other' })]
                : Array.from({ length: 9 }, () => knowledgeRow()),
          );
        await expect(
          service.retrieveSelectedBrandContentMemory(params, ['source-truth']),
        ).rejects.toThrow('knowledge_unavailable');
        expect(embeddings).toHaveBeenCalledTimes(1);
        expect(queryRaw).toHaveBeenCalledTimes(2);
      },
    );

    it('propagates one embedding failure without searching or retrying', async () => {
      const { contextBase, embeddings, queryRaw, service } = buildService();
      contextBase.findMany.mockResolvedValue([base]);
      embeddings.mockRejectedValue(new Error('embedding unavailable'));
      await expect(
        service.retrieveSelectedBrandContentMemory(params, ['source-truth']),
      ).rejects.toThrow();
      expect(embeddings).toHaveBeenCalledTimes(1);
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('retrieveOrgAndPersonalContentMemory', () => {
    const USER_A = 'user-a';
    const USER_C = 'user-c';

    it('returns nothing without an actor instead of an unscoped read', async () => {
      const { contextBase, service } = buildService();

      const hits = await service.retrieveOrgAndPersonalContentMemory({
        organizationId: 'org-1',
        query: 'pricing',
        userId: '  ',
      });

      expect(hits).toEqual([]);
      expect(contextBase.findMany).not.toHaveBeenCalled();
    });

    it('selects only organization-wide and the actor’s own personal Knowledge bases', async () => {
      const { contextBase, service } = buildService();

      await service.retrieveOrgAndPersonalContentMemory({
        organizationId: 'org-1',
        query: 'pricing',
        userId: USER_A,
      });

      const where = contextBase.findMany.mock.calls[0]?.[0]?.where;
      expect(where).toMatchObject({
        AND: [{ data: { equals: 'knowledge-base', path: ['purpose'] } }],
        isDeleted: false,
        OR: [
          {
            AND: [
              { sourceBrandId: null },
              { data: { equals: 'org', path: ['knowledgeScope'] } },
            ],
          },
          {
            AND: [
              { sourceBrandId: null },
              { createdById: USER_A },
              { data: { equals: 'personal', path: ['knowledgeScope'] } },
            ],
          },
        ],
        organizationId: 'org-1',
      });
    });

    it('never returns any brand-owned base, even one labelled as organization-wide', async () => {
      const { contextBase, queryRaw, service } = buildService();
      contextBase.findMany.mockResolvedValue([
        {
          createdById: null,
          data: { knowledgeScope: 'org', purpose: 'knowledge-base' },
          id: 'ctx-org',
          sourceBrandId: null,
        },
        {
          // Legacy owner recorded only in JSON — still brand-owned.
          createdById: null,
          data: {
            brandId: BRAND_A,
            knowledgeScope: 'org',
            purpose: 'knowledge-base',
          },
          id: 'ctx-brand-legacy',
          sourceBrandId: null,
        },
        {
          createdById: null,
          data: { knowledgeScope: 'org', purpose: 'knowledge-base' },
          id: 'ctx-brand-owned',
          sourceBrandId: BRAND_A,
        },
      ]);
      queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.retrieveOrgAndPersonalContentMemory({
        organizationId: 'org-1',
        query: 'pricing',
        userId: USER_A,
      });

      const similarity = lastSimilarityQuery(queryRaw);
      expect(similarity.values).toContain('ctx-org');
      expect(similarity.values).not.toContain('ctx-brand-legacy');
      expect(similarity.values).not.toContain('ctx-brand-owned');
    });

    it('never returns another user’s personal-scope base', async () => {
      const { contextBase, queryRaw, service } = buildService();
      contextBase.findMany.mockResolvedValue([
        {
          createdById: USER_A,
          data: { knowledgeScope: 'personal', purpose: 'knowledge-base' },
          id: 'ctx-personal-a',
          sourceBrandId: null,
        },
        {
          createdById: USER_C,
          data: { knowledgeScope: 'personal', purpose: 'knowledge-base' },
          id: 'ctx-personal-c',
          sourceBrandId: null,
        },
      ]);
      queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.retrieveOrgAndPersonalContentMemory({
        organizationId: 'org-1',
        query: 'pricing',
        userId: USER_A,
      });

      const similarity = lastSimilarityQuery(queryRaw);
      expect(similarity.values).toContain('ctx-personal-a');
      expect(similarity.values).not.toContain('ctx-personal-c');
      expect(similarity.sql).toContain('OR (s."scope" = ? AND s."userId" = ?)');
    });
  });

  describe('retrieveBrandKnowledge', () => {
    it('selects only the brand and organization Knowledge bases', async () => {
      const { contextBase, service } = buildService();

      await service.retrieveBrandKnowledge({
        userId: 'user-a',
        brandId: BRAND_A,
        organizationId: 'org-1',
        query: 'pricing',
      });

      const where = contextBase.findMany.mock.calls[0]?.[0]?.where;
      expect(where).toMatchObject({
        AND: [{ data: { equals: 'knowledge-base', path: ['purpose'] } }],
        isDeleted: false,
        OR: [
          {
            AND: [
              { sourceBrandId: BRAND_A },
              { data: { equals: 'brand', path: ['knowledgeScope'] } },
            ],
          },
          {
            AND: [
              { sourceBrandId: null },
              { data: { equals: 'org', path: ['knowledgeScope'] } },
            ],
          },
        ],
        organizationId: 'org-1',
      });
    });

    it('returns BRAND_TRUTH passages and never inspiration or research', async () => {
      const { contextBase, queryRaw, service } = buildService();
      contextBase.findMany.mockResolvedValue([
        {
          data: { knowledgeScope: 'brand', purpose: 'knowledge-base' },
          id: 'ctx-knowledge-a',
          sourceBrandId: BRAND_A,
        },
      ]);
      queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
        knowledgeRow(),
        knowledgeRow({
          content: 'Competitor hook we liked',
          knowledgeSourceId: 'source-inspiration',
          knowledgeSourcePurpose: 'INSPIRATION',
          knowledgeSourceTitle: 'Saved competitor post',
        }),
        knowledgeRow({
          content: 'Market size is 2B',
          knowledgeSourceId: 'source-research',
          knowledgeSourcePurpose: 'RESEARCH',
          knowledgeSourceTitle: 'Market report',
        }),
      ]);

      const hits = await service.retrieveBrandKnowledge({
        userId: 'user-a',
        brandId: BRAND_A,
        organizationId: 'org-1',
        query: 'pricing',
      });

      const similarity = lastSimilarityQuery(queryRaw);
      expect(similarity.sql).toContain('AND e."knowledgeSourceId" IS NOT NULL');
      expect(similarity.sql).toContain('s."purpose"::text IN (?)');
      expect(similarity.values).toEqual(
        expect.arrayContaining(['BRAND_TRUTH', BRAND_A]),
      );
      expect(similarity.values).not.toContain('INSPIRATION');
      expect(similarity.values).not.toContain('RESEARCH');
      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatchObject({
        citation: {
          purpose: 'BRAND_TRUTH',
          sourceId: 'source-truth',
          title: 'Pricing page',
        },
        content: 'Plans start at $29',
        source: 'Pricing page',
      });
    });

    it('drops Knowledge bases that belong to another brand', async () => {
      const { contextBase, queryRaw, service } = buildService();
      contextBase.findMany.mockResolvedValue([
        {
          data: { knowledgeScope: 'brand', purpose: 'knowledge-base' },
          id: 'ctx-knowledge-b',
          sourceBrandId: BRAND_B,
        },
      ]);

      const hits = await service.retrieveBrandKnowledge({
        userId: 'user-a',
        brandId: BRAND_A,
        organizationId: 'org-1',
        query: 'pricing',
      });

      expect(hits).toEqual([]);
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });
});
