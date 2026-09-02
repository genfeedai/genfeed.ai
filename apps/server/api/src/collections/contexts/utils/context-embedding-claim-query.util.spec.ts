vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import {
  buildEmbeddingFailureQuery,
  buildEmptyContentFailQuery,
  buildPendingEmbeddingClaimQuery,
  EMBEDDING_CLAIM_TTL_MINUTES,
  EMBEDDING_REBUILD_BATCH_LIMIT,
} from '@api/collections/contexts/utils/context-embedding-claim-query.util';
import type { MockSql } from '@api/shared/testing/prisma-mock';

describe('context embedding claim query', () => {
  it('claims a bounded tenant-scoped batch with SKIP LOCKED', () => {
    const query = buildPendingEmbeddingClaimQuery('org-1', [
      'ctx-1',
      'ctx-2',
    ]) as unknown as MockSql;

    expect(query.sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(query.sql).toContain('embeddingClaimedAt');
    expect(query.sql).toContain('embeddingFailedAt');
    expect(query.sql).toContain(
      "NULLIF(BTRIM(\"data\"->>'content'), '') IS NOT NULL",
    );
    expect(query.sql).toContain('LIMIT ?');
    expect(query.sql).toContain('"organizationId" = ?');
    expect(query.sql).toContain('"isDeleted" = false');
    expect(query.values).toEqual(
      expect.arrayContaining([
        'org-1',
        'ctx-1',
        'ctx-2',
        EMBEDDING_REBUILD_BATCH_LIMIT,
        EMBEDDING_CLAIM_TTL_MINUTES,
      ]),
    );
  });

  it('rejects an empty context-base list', () => {
    expect(() => buildPendingEmbeddingClaimQuery('org-1', [])).toThrow(
      'At least one context base is required for embedding claim',
    );
  });

  it('marks empty-content rows failed without embedding them', () => {
    const query = buildEmptyContentFailQuery('org-1', [
      'ctx-1',
    ]) as unknown as MockSql;

    expect(query.sql).toContain('SET "embeddingFailedAt" = NOW()');
    expect(query.sql).toContain(
      "NULLIF(BTRIM(\"data\"->>'content'), '') IS NULL",
    );
    expect(query.sql).toContain('"organizationId" = ?');
    expect(query.values).toEqual(expect.arrayContaining(['org-1', 'ctx-1']));
  });

  it('clears the claim when a provider embed fails', () => {
    const query = buildEmbeddingFailureQuery(
      'entry-1',
      'org-1',
    ) as unknown as MockSql;

    expect(query.sql).toContain('"embeddingFailedAt" = NOW()');
    expect(query.sql).toContain('"embeddingClaimedAt" = NULL');
    expect(query.values).toEqual(expect.arrayContaining(['entry-1', 'org-1']));
  });
});
