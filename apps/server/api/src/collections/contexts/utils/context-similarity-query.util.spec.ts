vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import {
  buildContextSimilarityQuery,
  serializeContextEmbedding,
  similarityToCosineDistance,
} from '@api/collections/contexts/utils/context-similarity-query.util';
import type { MockSql } from '@api/shared/testing/prisma-mock';
import { CONTEXT_EMBEDDING_DIMENSION } from '@genfeedai/contracts/constants';

describe('context similarity query', () => {
  it('maps minimum similarity to cosine distance', () => {
    expect(similarityToCosineDistance(0.7)).toBeCloseTo(0.3);
    expect(similarityToCosineDistance(1)).toBe(0);
  });

  it('builds one tenant-scoped indexed similarity query', () => {
    const embedding = Array.from(
      { length: CONTEXT_EMBEDDING_DIMENSION },
      (_, index) => index / CONTEXT_EMBEDDING_DIMENSION,
    );
    const query = buildContextSimilarityQuery(
      'org-1',
      ['context-1', 'context-2'],
      embedding,
      5,
      0.7,
    ) as unknown as MockSql;

    expect(query.sql).toContain('FROM "context_entries"');
    expect(query.sql).toContain('"organizationId" = ?');
    expect(query.sql).toContain('"isDeleted" = false');
    expect(query.sql).toContain('"contextBaseId" IN (?,?)');
    expect(query.sql).toContain('ORDER BY "embedding" <=> ?::vector ASC');
    expect(query.values).toEqual(
      expect.arrayContaining(['org-1', 'context-1', 'context-2', 5]),
    );
    const distanceThreshold = query.values.find(
      (value) => typeof value === 'number' && value > 0 && value < 1,
    );
    expect(distanceThreshold).toBeCloseTo(0.3);
  });

  it('rejects vectors that do not match the fixed dimension', () => {
    expect(() => serializeContextEmbedding([0.1, 0.2])).toThrow(
      `${CONTEXT_EMBEDDING_DIMENSION} finite values`,
    );
  });

  it('admits Knowledge chunks only through a ready, active, retained, current, visible version', () => {
    const embedding = new Array(CONTEXT_EMBEDDING_DIMENSION).fill(0.1);
    const query = buildContextSimilarityQuery(
      'org-1',
      ['context-1'],
      embedding,
      5,
      0.7,
    ) as unknown as MockSql;

    expect(query.sql).toContain('LEFT JOIN "knowledge_source_versions" v');
    expect(query.sql).toContain('LEFT JOIN "knowledge_sources" s');
    expect(query.sql).toContain('e."knowledgeSourceVersionId" IS NULL');
    for (const clause of [
      `v."processingState" = 'READY'`,
      `v."retrievalState" = 'ACTIVE'`,
      `v."retentionState" = 'RETAINED'`,
      'v."isCurrent" = true',
      'v."isDeleted" = false',
      'v."expiresAt" IS NULL OR v."expiresAt" > NOW()',
      's."isVisible" = true',
      's."isDeleted" = false',
    ]) {
      expect(query.sql).toContain(clause);
    }
    expect(query.sql).toContain('AS "knowledgeSourceVersionId"');
    expect(query.sql).toContain(
      `v."provenance"->>'url' AS "knowledgeSourceUrl"`,
    );
    expect(query.sql).not.toContain('"knowledgeSourceId" IN');
    expect(query.sql).not.toContain('"purpose"::text IN');
  });

  it('narrows to explicit sources and purposes without dropping legacy memory', () => {
    const embedding = new Array(CONTEXT_EMBEDDING_DIMENSION).fill(0.1);
    const query = buildContextSimilarityQuery(
      'org-1',
      ['context-1'],
      embedding,
      5,
      0.7,
      {
        knowledgePurposes: ['BRAND_TRUTH', 'RESEARCH'] as never,
        knowledgeSourceIds: ['source-1', 'source-2'],
      },
    ) as unknown as MockSql;

    expect(query.sql).toContain('AND e."knowledgeSourceId" IN (?,?)');
    expect(query.sql).toContain(
      'AND (e."knowledgeSourceId" IS NULL OR s."purpose"::text IN (?,?))',
    );
    expect(query.values).toEqual(
      expect.arrayContaining([
        'source-1',
        'source-2',
        'BRAND_TRUTH',
        'RESEARCH',
      ]),
    );
  });
});
