import { LearningFenceEscalationError } from '@api/collections/content-learning/services/learning-dependency.service';
import {
  patchCredentialsWithLearning,
  patchCredentialWithLearning,
  reconcileCredentialWithLearning,
  removeCredentialWithLearning,
} from '@api/collections/credentials/services/credential-learning-mutation.util';
import { describe, expect, it, vi } from 'vitest';

const GLOBAL_EXCLUSIVE = 'pg_advisory_xact_lock(5728, 1)';
const GLOBAL_SHARED = 'pg_advisory_xact_lock_shared(5728, 1)';
const context = {
  logger: { debug: vi.fn() },
  normalizeData: (value: unknown) => value,
  normalizeDocument: (value: unknown) => value,
} as never;

function fixture(organizationId: string | null) {
  const row = {
    id: 'cred',
    organizationId,
    brandId: organizationId ? 'brand' : null,
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
          : ((query as { sql?: string }).sql ?? ''),
      );
      return [{ id: 'locked' }];
    }),
    brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand' }) },
    credential: {
      findMany: vi.fn().mockResolvedValue([row]),
      findFirst: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentLearningAccount: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentLearningDependency: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
  return { sql, tx };
}
const has = (sql: string[], needle: string) =>
  sql.some((entry) => entry.includes(needle));

describe('credential learning mutation fence scope (#6158)', () => {
  it('patch of an org-owned credential takes the org fence, never the global exclusive fence', async () => {
    const { sql, tx } = fixture('org');
    await patchCredentialWithLearning(
      tx as never,
      context,
      'cred',
      { accessToken: 'refreshed' },
      'organization',
    );
    // A global exclusive fence would stall every other organization's post edits and publishes.
    expect(has(sql, GLOBAL_EXCLUSIVE)).toBe(false);
    expect(has(sql, GLOBAL_SHARED)).toBe(true);
    expect(has(sql, 'pg_advisory_xact_lock(')).toBe(true);
  });

  it('remove of an org-owned credential takes the org fence', async () => {
    const { sql, tx } = fixture('org');
    await removeCredentialWithLearning(
      tx as never,
      context,
      'cred',
      'organization',
    );
    expect(has(sql, GLOBAL_EXCLUSIVE)).toBe(false);
    expect(has(sql, GLOBAL_SHARED)).toBe(true);
  });

  it('reconcile of an org-owned credential takes the org fence', async () => {
    const { sql, tx } = fixture('org');
    await reconcileCredentialWithLearning(
      tx as never,
      context,
      {
        connectionUpdate: {},
        externalId: 'x',
        id: 'cred',
        organizationId: 'org',
        profileUpdate: {},
      },
      'organization',
    ).catch(() => undefined);
    expect(has(sql, GLOBAL_EXCLUSIVE)).toBe(false);
    expect(has(sql, GLOBAL_SHARED)).toBe(true);
  });

  it('an escalated rerun takes the global exclusive fence', async () => {
    const { sql, tx } = fixture('org');
    await patchCredentialWithLearning(
      tx as never,
      context,
      'cred',
      { accessToken: 'refreshed' },
      'global',
    );
    expect(has(sql, GLOBAL_EXCLUSIVE)).toBe(true);
  });

  it('a null-org credential keeps the global exclusive fence', async () => {
    const { sql, tx } = fixture(null);
    await patchCredentialWithLearning(
      tx as never,
      context,
      'cred',
      { accessToken: 'refreshed' },
      'organization',
    );
    expect(has(sql, GLOBAL_EXCLUSIVE)).toBe(true);
  });

  it('a cross-org bulk patch keeps the global exclusive fence', async () => {
    const { sql, tx } = fixture('org');
    await patchCredentialsWithLearning(
      tx as never,
      context,
      { isDeleted: false },
      { isConnected: false },
    );
    expect(has(sql, GLOBAL_EXCLUSIVE)).toBe(true);
  });

  it('escalates when the credential changed organization after the owner read', async () => {
    const { tx } = fixture('org');
    tx.credential.findMany.mockResolvedValue([
      { ...(await tx.credential.findFirst()), organizationId: 'other' },
    ]);
    await expect(
      patchCredentialWithLearning(
        tx as never,
        context,
        'cred',
        { accessToken: 'refreshed' },
        'organization',
      ),
    ).rejects.toBeInstanceOf(LearningFenceEscalationError);
  });
});
