import { describe, expect, it } from 'vitest';
import {
  persistAuthorizedSnapshot,
  readStoredAuthorizedSnapshot,
} from './authorized-signals-storage.util';

type TestSnapshot = {
  grantedScopes: string[];
  refreshAttemptedAt: string;
  state: 'full' | 'revoked' | 'stale';
};

const snapshotSchema = {
  safeParse: (value: unknown) =>
    typeof value === 'object' && value !== null && 'state' in value
      ? { data: value as TestSnapshot, success: true as const }
      : { success: false as const },
};

const snapshot: TestSnapshot = {
  grantedScopes: ['scope.read'],
  refreshAttemptedAt: '2026-11-04T10:00:00.000Z',
  state: 'full',
};

function createHarness() {
  const merged: Array<{
    id: string;
    organizationId: string;
    signals: Record<string, unknown>;
  }> = [];
  const cached: Array<{
    key: string;
    options: { tags?: string[]; ttl?: number };
    value: unknown;
  }> = [];
  const synced: unknown[] = [];
  const logs: Array<{ context: unknown; message: string }> = [];

  return {
    cached,
    cacheService: {
      set: async (
        key: string,
        value: unknown,
        options: { tags?: string[]; ttl?: number } = {},
      ) => {
        cached.push({ key, options, value });
        return true;
      },
    },
    credentialsService: {
      mergeWarmupSignals: async (
        id: string,
        organizationId: string,
        signals: Record<string, unknown>,
      ) => {
        merged.push({ id, organizationId, signals });
      },
    },
    logs,
    loggerService: {
      log: (message: string, context?: unknown) => {
        logs.push({ context, message });
      },
    },
    merged,
    synced,
    syncEnrollment: async (params: unknown) => {
      synced.push(params);
    },
  };
}

function persist(
  harness: ReturnType<typeof createHarness>,
  overrides: {
    brandId?: string | null;
    snapshot?: TestSnapshot;
  } = {},
) {
  return persistAuthorizedSnapshot({
    authorizationStorageKey: 'fooAuthorization',
    cacheKey: 'foo:cred-1',
    cacheService: harness.cacheService,
    cacheTags: ['foo-signals', 'foo-authz:org-1'],
    credential: {
      brandId: overrides.brandId === undefined ? 'brand-1' : overrides.brandId,
      id: 'cred-1',
    },
    credentialsService: harness.credentialsService,
    freshTtlSeconds: 300,
    loggerName: 'FooService',
    loggerService: harness.loggerService,
    organizationId: 'org-1',
    signalsStorageKey: 'fooAuthorized',
    snapshot: overrides.snapshot ?? snapshot,
    staleTtlSeconds: 60,
    syncEnrollment: harness.syncEnrollment,
  });
}

describe('persistAuthorizedSnapshot', () => {
  it('stores only the platform-owned warmup keys and returns the snapshot', async () => {
    const harness = createHarness();

    await expect(persist(harness)).resolves.toBe(snapshot);

    expect(harness.merged).toEqual([
      {
        id: 'cred-1',
        organizationId: 'org-1',
        signals: {
          fooAuthorization: {
            grantedScopes: ['scope.read'],
            observedAt: '2026-11-04T10:00:00.000Z',
          },
          fooAuthorized: snapshot,
        },
      },
    ]);
  });

  it('caches with scoped tags, the credential id and the fresh TTL', async () => {
    const harness = createHarness();

    await persist(harness);

    expect(harness.cached).toEqual([
      {
        key: 'foo:cred-1',
        options: {
          tags: ['foo-signals', 'foo-authz:org-1', 'cred-1'],
          ttl: 300,
        },
        value: snapshot,
      },
    ]);
  });

  it.each(['stale', 'revoked'] as const)(
    'uses the short TTL for a %s snapshot',
    async (state) => {
      const harness = createHarness();

      await persist(harness, { snapshot: { ...snapshot, state } });

      expect(harness.cached[0]?.options.ttl).toBe(60);
    },
  );

  it('syncs the brand enrollment only when the credential has a brand', async () => {
    const withBrand = createHarness();
    const withoutBrand = createHarness();

    await persist(withBrand);
    await persist(withoutBrand, { brandId: null });

    expect(withBrand.synced).toEqual([
      {
        brandId: 'brand-1',
        credentialId: 'cred-1',
        organizationId: 'org-1',
        snapshot,
      },
    ]);
    expect(withoutBrand.synced).toEqual([]);
  });

  it('logs the completed refresh with the snapshot state', async () => {
    const harness = createHarness();

    await persist(harness);

    expect(harness.logs).toEqual([
      {
        context: { credentialId: 'cred-1', state: 'full' },
        message: 'FooService refresh completed',
      },
    ]);
  });
});

describe('readStoredAuthorizedSnapshot', () => {
  it('returns the stored snapshot when it validates', () => {
    expect(
      readStoredAuthorizedSnapshot(
        { warmupSignals: { fooAuthorized: snapshot } },
        'fooAuthorized',
        snapshotSchema,
      ),
    ).toEqual(snapshot);
  });

  it.each([
    ['no warmup signals', null],
    ['no stored snapshot', { other: 1 }],
    ['an invalid stored snapshot', { fooAuthorized: 'garbage' }],
  ])('returns undefined for %s', (_label, warmupSignals) => {
    expect(
      readStoredAuthorizedSnapshot(
        { warmupSignals } as unknown as Parameters<
          typeof readStoredAuthorizedSnapshot
        >[0],
        'fooAuthorized',
        snapshotSchema,
      ),
    ).toBeUndefined();
  });
});
