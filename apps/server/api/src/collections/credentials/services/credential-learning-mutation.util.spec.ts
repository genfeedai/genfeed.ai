import { patchCredentialWithLearning } from '@api/collections/credentials/services/credential-learning-mutation.util';
import { describe, expect, it, vi } from 'vitest';

const GLOBAL_EXCLUSIVE = 'pg_advisory_xact_lock(5728, 1)';

describe('credential learning mutation fence scope (#6158)', () => {
  it('does not take the global exclusive learning fence for an org-owned credential patch', async () => {
    const row = {
      id: 'cred',
      organizationId: 'org',
      brandId: 'brand',
      isDeleted: false,
      isConnected: true,
      platform: 'TWITTER',
      externalId: 'x',
    };
    const sql: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async (query: unknown) => {
        sql.push(
          Array.isArray(query)
            ? query.join(' ')
            : ((query as { sql: string }).sql ?? ''),
        );
        return [{ id: 'locked' }];
      }),
      brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand' }) },
      credential: {
        findMany: vi.fn().mockResolvedValue([row]),
        findFirst: vi.fn().mockResolvedValue(row),
        update: vi.fn().mockResolvedValue(row),
      },
      contentLearningAccount: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contentLearningDependency: { findMany: vi.fn().mockResolvedValue([]) },
    };
    await patchCredentialWithLearning(
      tx as never,
      {
        normalizeDocument: (value: unknown) => value,
        normalizeData: (v: unknown) => v,
        logger: { debug: vi.fn() },
      } as never,
      'cred',
      { accessToken: 'refreshed' },
    );
    // A global exclusive fence stalls every other organization's post edits and publishes.
    expect(sql.some((entry) => entry.includes(GLOBAL_EXCLUSIVE))).toBe(false);
  });
});
