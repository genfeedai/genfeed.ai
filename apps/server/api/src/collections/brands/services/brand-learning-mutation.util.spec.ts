import {
  lockBrandLearningMutation,
  patchBrandWithLearning,
} from '@api/collections/brands/services/brand-learning-mutation.util';
import { describe, expect, it, vi } from 'vitest';

const GLOBAL_EXCLUSIVE = 'pg_advisory_xact_lock(5728, 1)';
const GLOBAL_SHARED = 'pg_advisory_xact_lock_shared(5728, 1)';

function fixture() {
  const row = {
    id: 'brand',
    organizationId: 'org',
    isDeleted: false,
    isActive: true,
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
    brand: {
      findFirst: vi.fn(async () => ({ ...row })),
      findMany: vi.fn().mockResolvedValue([{ id: 'brand' }]),
      update: vi.fn(async ({ data }: { data: object }) => ({
        ...row,
        ...data,
      })),
    },
    contentLearningAccount: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentLearningDependency: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return { sql, tx };
}
const has = (sql: string[], needle: string) =>
  sql.some((entry) => entry.includes(needle));

describe('brand learning mutation fence scope (#6158)', () => {
  it('a same-organization patch takes the org fence, never the global exclusive fence', async () => {
    const { sql, tx } = fixture();
    await patchBrandWithLearning(
      tx as never,
      { brandId: 'brand', data: { isActive: false } },
      'organization',
    );
    expect(has(sql, GLOBAL_EXCLUSIVE)).toBe(false);
    expect(has(sql, GLOBAL_SHARED)).toBe(true);
  });

  it('an escalated rerun takes the global exclusive fence', async () => {
    const { sql, tx } = fixture();
    await patchBrandWithLearning(
      tx as never,
      { brandId: 'brand', data: { isActive: false } },
      'global',
    );
    expect(has(sql, GLOBAL_EXCLUSIVE)).toBe(true);
  });

  it('relocation and lifecycle callers keep the global exclusive fence', async () => {
    const { sql, tx } = fixture();
    await lockBrandLearningMutation(tx as never, {
      brandId: 'brand',
      destinationOrganizationId: 'other',
      lockAllSourceBrands: true,
    });
    expect(has(sql, GLOBAL_EXCLUSIVE)).toBe(true);
  });
});
