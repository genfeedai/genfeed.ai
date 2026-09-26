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

/**
 * Brand isolation of the legacy `enhancePrompt` retrieval path (still used by
 * the public `/contexts/enhance-prompt` endpoint). The brand/org/personal
 * Knowledge retrieval methods this file used to also cover
 * (`retrieveBrandContentMemory`, `retrieveOrgAndPersonalContentMemory`,
 * `retrieveBrandKnowledge`) moved to `KnowledgeContentRetrievalService` and
 * its own spec (#5144 follow-up, runtime-complexity file-size guard).
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
});
