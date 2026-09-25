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
 */
describe('ContextsService brand-scoped retrieval', () => {
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
    const generateEmbedding = vi
      .fn()
      .mockResolvedValue(new Array(1024).fill(0.1));
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

    return { contextBase, generateEmbedding, queryRaw, service };
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

  describe('enhancePrompt', () => {
    const multiBrandBases = [
      {
        data: { isActive: true, label: 'A memory', type: 'content_library' },
        id: 'ctx-a',
        sourceBrandId: BRAND_A,
      },
      {
        data: { isActive: true, label: 'B memory', type: 'content_library' },
        id: 'ctx-b',
        sourceBrandId: BRAND_B,
      },
      {
        // Legacy owner recorded only in JSON.
        data: {
          brandId: BRAND_B,
          isActive: true,
          label: 'B winners',
          type: 'content_library',
        },
        id: 'ctx-b-legacy',
        sourceBrandId: null,
      },
      {
        data: { isActive: true, label: 'Org voice', type: 'brand_voice' },
        id: 'ctx-org',
        sourceBrandId: null,
      },
      {
        data: {
          isActive: true,
          knowledgeScope: 'personal',
          label: 'Personal',
          type: 'content_library',
        },
        id: 'ctx-personal',
        sourceBrandId: null,
      },
    ];

    it('never retrieves another brand’s bases for the active brand', async () => {
      const { contextBase, queryRaw, service } = buildService();
      contextBase.findMany.mockResolvedValue(multiBrandBases);
      queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          content: 'A saved hook',
          contextBaseId: 'ctx-a',
          similarity: 0.92,
        },
      ]);

      const result = await service.enhancePrompt(
        {
          brandId: BRAND_A,
          contentType: 'caption',
          prompt: 'write a post',
          useBrandVoice: true,
          useContentLibrary: true,
        },
        'org-1',
      );

      const where = contextBase.findMany.mock.calls[0]?.[0]?.where;
      expect(where).toMatchObject({
        isDeleted: false,
        OR: [{ sourceBrandId: BRAND_A }, { sourceBrandId: null }],
        organizationId: 'org-1',
      });

      const similarity = lastSimilarityQuery(queryRaw);
      expect(similarity.values).toEqual(
        expect.arrayContaining(['ctx-a', 'ctx-org']),
      );
      expect(similarity.values).not.toContain('ctx-b');
      expect(similarity.values).not.toContain('ctx-b-legacy');
      expect(similarity.values).not.toContain('ctx-personal');
      expect(result.context).toEqual([
        {
          content: 'A saved hook',
          contextBaseId: 'ctx-a',
          contextBaseType: 'content_library',
          relevance: 0.92,
          source: 'A memory',
        },
      ]);
    });

    it('reads only organization-wide bases when no brand is active', async () => {
      const { contextBase, queryRaw, service } = buildService();
      contextBase.findMany.mockResolvedValue(multiBrandBases);

      await service.enhancePrompt(
        {
          contentType: 'caption',
          prompt: 'write a post',
          useBrandVoice: true,
          useContentLibrary: true,
        },
        'org-1',
      );

      expect(contextBase.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
        OR: [{ sourceBrandId: null }],
      });
      const similarity = lastSimilarityQuery(queryRaw);
      expect(similarity.values).toContain('ctx-org');
      expect(similarity.values).not.toContain('ctx-a');
      expect(similarity.values).not.toContain('ctx-b');
      expect(similarity.values).not.toContain('ctx-b-legacy');
    });
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
