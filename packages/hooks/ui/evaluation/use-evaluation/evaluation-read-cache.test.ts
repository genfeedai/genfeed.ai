import {
  evaluationReadRevision,
  evaluationReadScopeKey,
  evaluationVideoCache,
  evaluationVideosQueryKey,
  invalidateEvaluationVideoRead,
  useEvaluationReadScopeKey,
} from '@hooks/ui/evaluation/use-evaluation/evaluation-read-cache';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  desktop: false,
  bootstrap: vi.fn(),
  change: vi.fn(),
  organizationId: 'org',
  brandId: 'brand',
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    organizationId: runtime.organizationId,
    brandId: runtime.brandId,
  }),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ userId: 'user' }),
}));
vi.mock('@genfeedai/config/deployment', () => ({
  isDesktopClient: () => runtime.desktop,
}));
vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://test.api' },
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));
const scope = (server = 'a', org = 'org') =>
  evaluationReadScopeKey('https://test.api', server, 'user', org, 'brand');
describe('Persisted evaluation scoped video cache', () => {
  beforeEach(() => {
    localStorage.clear();
    evaluationVideoCache.remove(scope());
    evaluationVideoCache.remove(scope('b'));
    evaluationVideoCache.remove(scope('storage-failure'));
    runtime.desktop = false;
    runtime.organizationId = 'org';
    runtime.brandId = 'brand';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('separates endpoint, server, canonical user, organization and brand including delimiter-containing IDs', () => {
    const key = scope();
    for (let index = 0; index < 5; index++) {
      const parts: [string, string, string, string, string] = [
        'https://test.api',
        'a',
        'user',
        'org',
        'brand',
      ];
      parts[index] = `${parts[index]}:other`;
      expect(evaluationReadScopeKey(...parts)).not.toBe(key);
    }
    expect(evaluationVideosQueryKey(key)).toEqual([
      'analytics-trends-videos',
      key,
    ]);
  });
  it('removes only the active fallback and refetches the warm mounted query without touching another server', async () => {
    const client = new QueryClient();
    const active = scope();
    const other = scope('b');
    evaluationVideoCache.set(active, [], 30 * 60_000);
    evaluationVideoCache.set(other, [], 30 * 60_000);
    client.setQueryData(evaluationVideosQueryKey(active), 'old');
    client.setQueryData(evaluationVideosQueryKey(other), 'other');
    const read = vi.fn().mockResolvedValue('committed');
    const observer = new QueryObserver(client, {
      queryKey: evaluationVideosQueryKey(active),
      queryFn: read,
      staleTime: 30 * 60_000,
    });
    const unsubscribe = observer.subscribe(() => {});
    const before = evaluationReadRevision(active);
    await invalidateEvaluationVideoRead(client, active);
    expect(evaluationReadRevision(active)).toBe(before + 1);
    expect(evaluationVideoCache.get(active)).toBeNull();
    expect(evaluationVideoCache.get(other)).toEqual([]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(evaluationVideosQueryKey(active))).toBe(
      'committed',
    );
    expect(client.getQueryData(evaluationVideosQueryKey(other))).toBe('other');
    unsubscribe();
    client.clear();
  });
  it('cannot revive old storage after a known change even when browser removal fails', async () => {
    const active = scope('storage-failure');
    const client = new QueryClient();
    evaluationVideoCache.set(active, []);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    await invalidateEvaluationVideoRead(client, active);
    expect(evaluationVideoCache.get(active)).toBeNull();
    client.clear();
  });
  it('requires canonical desktop server identity and ignores late initial bootstrap after switching servers', async () => {
    runtime.desktop = true;
    let resolve: (value: { environment: { serverId: string } }) => void =
      () => {};
    let onChange: (value: { environment: { serverId: string } }) => void =
      () => {};
    runtime.bootstrap.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    runtime.change.mockImplementation((callback: typeof onChange) => {
      onChange = callback;
      return vi.fn();
    });
    vi.stubGlobal('genfeedDesktop', {
      app: {
        getBootstrap: runtime.bootstrap,
        onDidBootstrapChange: runtime.change,
      },
    });
    const { result } = renderHook(useEvaluationReadScopeKey);
    expect(result.current).toBeNull();
    act(() => onChange({ environment: { serverId: 'server-b' } }));
    expect(result.current).toBe(
      evaluationReadScopeKey(
        'https://test.api',
        'server-b',
        'user',
        'org',
        'brand',
      ),
    );
    await act(async () => resolve({ environment: { serverId: 'server-a' } }));
    expect(result.current).toBe(
      evaluationReadScopeKey(
        'https://test.api',
        'server-b',
        'user',
        'org',
        'brand',
      ),
    );
  });
  it('recomputes scope when the active organization/brand changes without reusing another scope fallback', async () => {
    const { result, rerender } = renderHook(useEvaluationReadScopeKey);
    await waitFor(() =>
      expect(result.current).toBe(
        evaluationReadScopeKey(
          'https://test.api',
          'web',
          'user',
          'org',
          'brand',
        ),
      ),
    );
    const previous = result.current;
    if (!previous) throw new Error('Expected ready scope');
    evaluationVideoCache.set(previous, []);
    runtime.organizationId = 'other-org';
    runtime.brandId = 'other-brand';
    rerender();
    expect(result.current).toBe(
      evaluationReadScopeKey(
        'https://test.api',
        'web',
        'user',
        'other-org',
        'other-brand',
      ),
    );
    expect(evaluationVideoCache.get(result.current ?? 'missing')).toBeNull();
  });
});
