import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
  clearPersistedQueryCache,
  PERSISTED_QUERY_CACHE_MAX_AGE_MS,
  type PersistedQueryCacheRecord,
  type PersistedQueryCacheStorage,
  persistQueryMeta,
  restorePersistedQueryCache,
  savePersistedQueryCache,
  snapshotQueryCache,
} from '@/lib/query-cache/persisted-query-cache';

const SCOPE = { organizationId: 'org-1', userId: 'user-1' };
const BUILD = 'build-1';
const NOW = 1_700_000_000_000;

function createStorage(initial: PersistedQueryCacheRecord | null = null) {
  const state = { record: initial };
  const storage: PersistedQueryCacheStorage = {
    clear: async () => {
      state.record = null;
    },
    read: async () => state.record,
    write: async (record) => {
      state.record = record;
    },
  };
  return { state, storage };
}

async function seed(
  queryClient: QueryClient,
  key: string[],
  data: unknown,
  meta?: Record<string, unknown>,
) {
  await queryClient.fetchQuery({
    meta,
    queryFn: async () => data,
    queryKey: key,
  });
}

describe('persisted query cache', () => {
  it('keeps only the queries that opted in', async () => {
    const queryClient = new QueryClient();
    await seed(queryClient, ['kept'], { count: 3 }, persistQueryMeta());
    await seed(queryClient, ['private'], { token: 'secret' });

    expect(
      snapshotQueryCache(queryClient).queries.map((q) => q.queryKey),
    ).toEqual([['kept']]);
  });

  it('leaves out the fields a query names, at any depth', async () => {
    const queryClient = new QueryClient();
    await seed(
      queryClient,
      ['overview'],
      {
        reviewInbox: {
          recentItems: [{ id: 'a', mediaUrl: 'https://cdn/signed?x=1' }],
        },
      },
      persistQueryMeta({ omitKeys: ['mediaUrl'] }),
    );

    expect(snapshotQueryCache(queryClient).queries[0]?.state.data).toEqual({
      reviewInbox: { recentItems: [{ id: 'a' }] },
    });
  });

  it('brings a saved snapshot back for the same user, organization and build', async () => {
    const source = new QueryClient();
    await seed(source, ['kept'], { count: 3 }, persistQueryMeta());
    const { storage } = createStorage();
    await savePersistedQueryCache({
      buster: BUILD,
      now: NOW,
      queryClient: source,
      scope: SCOPE,
      storage,
    });

    const target = new QueryClient();
    const restored = await restorePersistedQueryCache({
      buster: BUILD,
      now: NOW + 1000,
      queryClient: target,
      scope: SCOPE,
      storage,
    });

    expect(restored).toBe(true);
    expect(target.getQueryData(['kept'])).toEqual({ count: 3 });
    expect(target.getQueryState(['kept'])?.isInvalidated).toBe(true);
  });

  it.each([
    ['another user', { ...SCOPE, userId: 'user-2' }, BUILD, 1000],
    [
      'another organization',
      { ...SCOPE, organizationId: 'org-2' },
      BUILD,
      1000,
    ],
    ['another build', SCOPE, 'build-2', 1000],
    [
      'a snapshot past its age',
      SCOPE,
      BUILD,
      PERSISTED_QUERY_CACHE_MAX_AGE_MS + 1,
    ],
  ])(
    'drops and removes a snapshot for %s',
    async (_label, scope, buster, age) => {
      const source = new QueryClient();
      await seed(source, ['kept'], { count: 3 }, persistQueryMeta());
      const { state, storage } = createStorage();
      await savePersistedQueryCache({
        buster: BUILD,
        now: NOW,
        queryClient: source,
        scope: SCOPE,
        storage,
      });

      const target = new QueryClient();
      const restored = await restorePersistedQueryCache({
        buster,
        now: NOW + age,
        queryClient: target,
        scope,
        storage,
      });

      expect(restored).toBe(false);
      expect(target.getQueryData(['kept'])).toBeUndefined();
      expect(state.record).toBeNull();
    },
  );

  it('removes the record when nothing opted in', async () => {
    const queryClient = new QueryClient();
    await seed(queryClient, ['private'], { token: 'secret' });
    const { state, storage } = createStorage({
      buster: BUILD,
      savedAt: NOW,
      state: { mutations: [], queries: [] },
      ...SCOPE,
    });

    await savePersistedQueryCache({
      buster: BUILD,
      queryClient,
      scope: SCOPE,
      storage,
    });

    expect(state.record).toBeNull();
  });

  it('treats a store that fails as an empty one', async () => {
    const failing: PersistedQueryCacheStorage = {
      clear: async () => {
        throw new Error('blocked');
      },
      read: async () => {
        throw new Error('blocked');
      },
      write: async () => {
        throw new Error('full');
      },
    };
    const queryClient = new QueryClient();
    await seed(queryClient, ['kept'], 1, persistQueryMeta());

    await expect(
      restorePersistedQueryCache({
        buster: BUILD,
        queryClient,
        scope: SCOPE,
        storage: failing,
      }),
    ).resolves.toBe(false);
    await expect(
      savePersistedQueryCache({
        buster: BUILD,
        queryClient,
        scope: SCOPE,
        storage: failing,
      }),
    ).resolves.toBeUndefined();
    await expect(clearPersistedQueryCache(failing)).resolves.toBeUndefined();
  });

  it('clears the stored record on sign-out', async () => {
    const { state, storage } = createStorage({
      buster: BUILD,
      savedAt: NOW,
      state: { mutations: [], queries: [] },
      ...SCOPE,
    });

    await clearPersistedQueryCache(storage);

    expect(state.record).toBeNull();
  });
});
