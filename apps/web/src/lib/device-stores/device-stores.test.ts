// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeBootRecord } from '@/lib/boot-record/boot-record';
import { createBootRecord } from '@/lib/boot-record/boot-record.fixture';
import {
  createWorkspaceLocalStorageCache,
  setDeviceStoreScope,
} from '@/lib/device-stores/device-store-scope';
import {
  WIPED_LOCAL_STORAGE_PREFIXES,
  WIPED_SESSION_STORAGE_PREFIXES,
  wipeDeviceStores,
} from '@/lib/device-stores/device-stores';

const clearQueryCache = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/lib/query-cache/persisted-query-cache', () => ({
  clearPersistedQueryCache: clearQueryCache,
}));

describe('wipeDeviceStores', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearQueryCache.mockClear();
    setDeviceStoreScope(null);
  });

  it('leaves no key of any listed store, and keeps layout preferences', async () => {
    writeBootRecord(createBootRecord());
    for (const prefix of WIPED_LOCAL_STORAGE_PREFIXES) {
      window.localStorage.setItem(`${prefix}x`, '1');
    }
    for (const prefix of WIPED_SESSION_STORAGE_PREFIXES) {
      window.sessionStorage.setItem(`${prefix}x`, '1');
    }
    window.localStorage.setItem('genfeed:sidebar:width', '280');
    window.localStorage.setItem('theme', 'dark');

    await wipeDeviceStores();

    const remaining: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      remaining.push(window.localStorage.key(index) ?? '');
    }
    expect(remaining.sort()).toEqual(['genfeed:sidebar:width', 'theme']);
    expect(window.sessionStorage.length).toBe(0);
    expect(clearQueryCache).toHaveBeenCalledOnce();
  });

  it('is safe to run twice', async () => {
    await wipeDeviceStores();
    await wipeDeviceStores();

    expect(window.localStorage.length).toBe(0);
  });
});

describe('a saved copy of a read', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setDeviceStoreScope(null);
  });

  it('is never returned to another user or under another organization', () => {
    const cache = createWorkspaceLocalStorageCache<string>(
      'analytics:top-posts:',
    );

    setDeviceStoreScope({ organizationId: 'org-1', userId: 'user-a' });
    cache.set('top', 'a-data');
    expect(cache.get('top')).toBe('a-data');

    setDeviceStoreScope({ organizationId: 'org-1', userId: 'user-b' });
    expect(cache.get('top')).toBeNull();

    setDeviceStoreScope({ organizationId: 'org-2', userId: 'user-a' });
    expect(cache.get('top')).toBeNull();
  });

  it('is neither read nor written before the scope is known', () => {
    const cache = createWorkspaceLocalStorageCache<string>(
      'analytics:top-posts:',
    );

    cache.set('top', 'early');

    expect(window.localStorage.length).toBe(0);
    expect(cache.get('top')).toBeNull();
  });
});
