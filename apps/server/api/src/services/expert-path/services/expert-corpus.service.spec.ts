import { ExpertCorpusService } from '@api/services/expert-path/services/expert-corpus.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

describe('ExpertCorpusService', () => {
  describe('summarize', () => {
    it('counts BRAND_TRUTH brand sources and returns only ids whose current version is READY', async () => {
      const findMany = vi.fn().mockResolvedValue([
        {
          id: 'source-ready',
          versions: [{ processingState: 'READY' }],
        },
        {
          id: 'source-processing',
          versions: [{ processingState: 'PROCESSING' }],
        },
        {
          id: 'source-no-version',
          versions: [],
        },
      ]);
      const service = new ExpertCorpusService({
        knowledgeSource: { findMany },
      } as unknown as PrismaService);

      const result = await service.summarize('org-1', 'brand-1');

      expect(result).toEqual({
        readySourceIds: ['source-ready'],
        sourceCount: 3,
      });
    });

    it('scopes the query to organization, isDeleted, brand and BRAND_TRUTH purpose', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const service = new ExpertCorpusService({
        knowledgeSource: { findMany },
      } as unknown as PrismaService);

      await service.summarize('org-1', 'brand-1');

      expect(findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          versions: {
            select: { processingState: true },
            take: 1,
            where: { isCurrent: true, isDeleted: false },
          },
        },
        where: {
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
          purpose: 'BRAND_TRUTH',
        },
      });
    });

    it('returns zero counts and no ready ids when the brand has no sources', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const service = new ExpertCorpusService({
        knowledgeSource: { findMany },
      } as unknown as PrismaService);

      const result = await service.summarize('org-1', 'brand-1');

      expect(result).toEqual({ readySourceIds: [], sourceCount: 0 });
    });
  });
});
