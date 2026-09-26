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
        brandId: BRAND_A,
        organizationId: 'org-1',
        query: 'pricing',
      });

      expect(hits).toEqual([]);
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });
});
