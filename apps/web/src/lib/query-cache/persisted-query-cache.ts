import {
  type DehydratedState,
  dehydrate,
  hydrate,
  type Query,
  type QueryClient,
} from '@tanstack/react-query';

/**
 * The query cache, kept on the device across reloads.
 *
 * A page that was on screen ten seconds ago used to be rebuilt from zero after
 * a reload. One record holds the last snapshot of the queries a page opted in
 * to (`meta: { persist: true }`), scoped to the user and organization it was
 * read for. A restored query paints its last value at once and refreshes in the
 * background.
 *
 * What is stored is chosen by the query, never by default: a query that holds a
 * signed or short-lived URL, a token or a secret simply does not opt in, and
 * stays in memory.
 */

/** A snapshot older than this is dropped on read, not shown. */
export const PERSISTED_QUERY_CACHE_MAX_AGE_MS = 30 * 60_000;

/**
 * What a query's `meta.persist` may hold: `true` keeps the result as it is, and
 * `{ omitKeys }` keeps it without the named fields at any depth. A field that
 * carries a signed or short-lived URL is named there, so the link is never
 * written to the device.
 */
export type PersistQueryOption = true | { omitKeys: readonly string[] };

/** The `meta` that lets a query's result be kept on the device. */
export function persistQueryMeta(option: PersistQueryOption = true): {
  persist: PersistQueryOption;
} {
  return { persist: option };
}

export interface PersistedQueryCacheScope {
  organizationId: string;
  userId: string;
}

export interface PersistedQueryCacheRecord extends PersistedQueryCacheScope {
  /** The build that wrote it: a release never reads an older shape. */
  buster: string;
  savedAt: number;
  state: DehydratedState;
}

/** Where the one record lives. The IndexedDB store below, or a fake in tests. */
export interface PersistedQueryCacheStorage {
  clear: () => Promise<void>;
  read: () => Promise<PersistedQueryCacheRecord | null>;
  write: (record: PersistedQueryCacheRecord) => Promise<void>;
}

function readPersistOption(
  meta: Query['meta'] | undefined,
): PersistQueryOption | null {
  const option = meta?.persist;
  if (option === true) {
    return true;
  }
  if (
    typeof option === 'object' &&
    option !== null &&
    'omitKeys' in option &&
    Array.isArray(option.omitKeys)
  ) {
    return { omitKeys: option.omitKeys.map(String) };
  }
  return null;
}

export function isPersistableQuery(query: Query): boolean {
  return (
    query.state.status === 'success' && readPersistOption(query.meta) !== null
  );
}

function omitKeysDeep(value: unknown, omitKeys: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => omitKeysDeep(item, omitKeys));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !omitKeys.has(key))
        .map(([key, item]) => [key, omitKeysDeep(item, omitKeys)]),
    );
  }
  return value;
}

export function snapshotQueryCache(queryClient: QueryClient): DehydratedState {
  const state = dehydrate(queryClient, {
    shouldDehydrateQuery: isPersistableQuery,
  });

  return {
    ...state,
    queries: state.queries.map((query) => {
      const option = readPersistOption(query.meta);
      if (option === null || option === true) {
        return query;
      }
      return {
        ...query,
        state: {
          ...query.state,
          data: omitKeysDeep(query.state.data, new Set(option.omitKeys)),
        },
      };
    }),
  };
}

interface RestoreOptions {
  buster: string;
  now?: number;
  queryClient: QueryClient;
  scope: PersistedQueryCacheScope;
  storage: PersistedQueryCacheStorage;
}

/**
 * Puts the stored snapshot into `queryClient` when it belongs to `scope`, was
 * written by this build and is young enough. A record that does not qualify is
 * removed, so another user's or organization's data does not stay on the device
 * behind a mismatch. Never throws: a store that cannot be read is an empty one.
 */
export async function restorePersistedQueryCache({
  buster,
  now = Date.now(),
  queryClient,
  scope,
  storage,
}: RestoreOptions): Promise<boolean> {
  try {
    const record = await storage.read();
    if (!record) {
      return false;
    }

    const isSameScope =
      record.userId === scope.userId &&
      record.organizationId === scope.organizationId;
    const isCurrent =
      record.buster === buster &&
      now - record.savedAt <= PERSISTED_QUERY_CACHE_MAX_AGE_MS;

    if (!isSameScope || !isCurrent) {
      await storage.clear();
      return false;
    }

    hydrate(queryClient, record.state);
    // What came back is what the last visit saw, whatever its stale time says:
    // mark it stale so each page that mounts it reads again in the background.
    await queryClient.invalidateQueries({ refetchType: 'none' });
    return true;
  } catch {
    return false;
  }
}

interface SaveOptions {
  buster: string;
  now?: number;
  queryClient: QueryClient;
  scope: PersistedQueryCacheScope;
  storage: PersistedQueryCacheStorage;
}

/** Writes the persistable part of the cache, or removes the record if none. */
export async function savePersistedQueryCache({
  buster,
  now = Date.now(),
  queryClient,
  scope,
  storage,
}: SaveOptions): Promise<void> {
  try {
    const state = snapshotQueryCache(queryClient);
    if (state.queries.length === 0) {
      await storage.clear();
      return;
    }

    await storage.write({ ...scope, buster, savedAt: now, state });
  } catch {
    // A full or blocked store only costs the next reload its head start.
  }
}

const DATABASE_NAME = 'genfeed-query-cache';
const STORE_NAME = 'snapshots';
const RECORD_KEY = 'current';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

/** The device store. Every call is a no-op where IndexedDB is unavailable. */
export const indexedDbQueryCacheStorage: PersistedQueryCacheStorage = {
  clear: async () => {
    if (typeof indexedDB === 'undefined') {
      return;
    }
    await withStore('readwrite', (store) => store.delete(RECORD_KEY));
  },
  read: async () => {
    if (typeof indexedDB === 'undefined') {
      return null;
    }
    const record = await withStore<PersistedQueryCacheRecord | undefined>(
      'readonly',
      (store) => store.get(RECORD_KEY),
    );
    return record ?? null;
  },
  write: async (record) => {
    if (typeof indexedDB === 'undefined') {
      return;
    }
    await withStore('readwrite', (store) => store.put(record, RECORD_KEY));
  },
};

/**
 * Removes the stored snapshot: on sign-out, so nothing of the session stays on
 * a shared device. Never throws.
 */
export async function clearPersistedQueryCache(
  storage: PersistedQueryCacheStorage = indexedDbQueryCacheStorage,
): Promise<void> {
  try {
    await storage.clear();
  } catch {
    // Nothing stored, or storage blocked: either way nothing is left to read.
  }
}
