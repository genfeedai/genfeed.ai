import { isDesktopClient } from '@genfeedai/config/deployment';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { IGenfeedDesktopBridge } from '@genfeedai/contracts/desktop';
import type { ITrendVideo } from '@genfeedai/contracts/interfaces';
import { createLocalStorageCache } from '@helpers/data/cache/cache.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import type { QueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

const revisions = new Map<string, number>();
const memoryVideos = new Map<
  string,
  { revision: number; videos: ITrendVideo[] }
>();
const persistedVideos = createLocalStorageCache<{
  revision: number;
  videos: ITrendVideo[];
}>({
  prefix: 'trends:evaluation-videos:',
});
function persistKey(scopeKey: string): string {
  return encodeURIComponent(scopeKey);
}
export const evaluationVideoCache = {
  get(scopeKey: string): ITrendVideo[] | null {
    const cached =
      memoryVideos.get(scopeKey) ?? persistedVideos.get(persistKey(scopeKey));
    return cached?.revision === evaluationReadRevision(scopeKey)
      ? cached.videos
      : null;
  },
  set(scopeKey: string, videos: ITrendVideo[], ttlMs?: number): void {
    const entry = {
      revision: evaluationReadRevision(scopeKey),
      videos,
    };
    memoryVideos.set(scopeKey, entry);
    persistedVideos.set(persistKey(scopeKey), entry, ttlMs);
  },
  remove(scopeKey: string): void {
    memoryVideos.delete(scopeKey);
    try {
      persistedVideos.remove(persistKey(scopeKey));
    } catch (error: unknown) {
      logger.error('Failed to remove stale evaluation fallback', error);
    }
  },
};

export function evaluationReadScopeKey(
  apiEndpoint: string,
  serverIdentity: string,
  userId: string,
  organizationId: string,
  brandId: string,
): string {
  return JSON.stringify([
    apiEndpoint,
    serverIdentity,
    userId,
    organizationId,
    brandId,
  ]);
}

export function evaluationVideosQueryKey(scopeKey: string | null) {
  return ['analytics-trends-videos', scopeKey] as const;
}

export function evaluationReadRevision(scopeKey: string): number {
  return revisions.get(scopeKey) ?? 0;
}

export async function invalidateEvaluationVideoRead(
  queryClient: QueryClient,
  scopeKey: string,
): Promise<void> {
  revisions.set(scopeKey, evaluationReadRevision(scopeKey) + 1);
  evaluationVideoCache.remove(scopeKey);
  await queryClient.invalidateQueries({
    exact: true,
    queryKey: evaluationVideosQueryKey(scopeKey),
  });
}

/** Desktop server switching restarts the client; bootstrap supplies its canonical server ID. */
export function useEvaluationReadScopeKey(): string | null {
  const { organizationId, brandId } = useBrand();
  const { userId } = useAuthIdentity();
  const apiEndpoint = EnvironmentService.apiEndpoint;
  const desktop = isDesktopClient();
  const [serverIdentity, setServerIdentity] = useState<string | null>(
    desktop ? null : 'web',
  );
  useEffect(() => {
    if (!desktop) {
      setServerIdentity('web');
      return;
    }
    const bridge = (
      globalThis as typeof globalThis & {
        genfeedDesktop?: IGenfeedDesktopBridge;
      }
    ).genfeedDesktop;
    const controller = new AbortController();
    let bootstrapRevision = 0;
    const initialRevision = bootstrapRevision;
    setServerIdentity(null);
    const unsubscribe = bridge?.app.onDidBootstrapChange((bootstrap) => {
      if (!controller.signal.aborted) {
        bootstrapRevision += 1;
        setServerIdentity(bootstrap.environment.serverId);
      }
    });
    bridge?.app
      .getBootstrap()
      .then((bootstrap) => {
        if (!controller.signal.aborted && bootstrapRevision === initialRevision)
          setServerIdentity(bootstrap.environment.serverId);
      })
      .catch(() => {
        /* A missing runtime identity cannot authorize a cache fallback. */
      });
    return () => {
      controller.abort();
      unsubscribe?.();
    };
  }, [desktop]);
  // EnvironmentService.apiEndpoint is a getter; desktop server switches can
  // change it without remounting. Keep it in the memo identity.
  // biome-ignore lint/correctness/useExhaustiveDependencies: live endpoint getter
  return useMemo(
    () =>
      userId && organizationId && brandId && serverIdentity
        ? evaluationReadScopeKey(
            apiEndpoint,
            serverIdentity,
            userId,
            organizationId,
            brandId,
          )
        : null,
    [apiEndpoint, serverIdentity, userId, organizationId, brandId],
  );
}
