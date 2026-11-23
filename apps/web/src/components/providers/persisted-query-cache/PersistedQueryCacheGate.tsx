'use client';

import { useRoutedOrganization } from '@genfeedai/contexts/user/organization-context/organization-context';
import { getPlaywrightAuthState } from '@genfeedai/helpers/auth/auth.helper';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  indexedDbQueryCacheStorage,
  type PersistedQueryCacheScope,
  type PersistedQueryCacheStorage,
  restorePersistedQueryCache,
  savePersistedQueryCache,
} from '@/lib/query-cache/persisted-query-cache';

/** How long the cache must be quiet before a snapshot is written. */
const PERSISTED_QUERY_CACHE_WRITE_DELAY_MS = 500;

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'development';

interface PersistedQueryCacheGateProps extends LayoutProps {
  /** Shown for the moment the stored snapshot is being read. */
  fallback?: ReactNode;
  storage?: PersistedQueryCacheStorage;
}

/**
 * Brings the query cache of the last visit back before the protected tree
 * mounts, and keeps the next visit's copy up to date.
 *
 * It sits inside the routed-organization boundary, so it only runs once the
 * organization in the URL is confirmed for the signed-in user. That is the
 * scope the snapshot is stored under and read back for: another user, another
 * organization, an older build or a snapshot past its age is dropped, never
 * shown. Until the read finishes the tree is held (a few milliseconds), so a
 * query with a stored value is mounted with it and paints it at once.
 *
 * The tree is held only for the first restore of the page load. After that the
 * shell is mounted for good: an organization switch confirms a new scope, which
 * is restored behind the mounted shell, never by replacing it with the
 * fallback (the rail and top bar stay the same nodes across a switch).
 */
export default function PersistedQueryCacheGate({
  children,
  fallback = null,
  storage = indexedDbQueryCacheStorage,
}: PersistedQueryCacheGateProps) {
  const queryClient = useQueryClient();
  const { userId } = useAuthIdentity();
  const { confirmedOrganizationId, isRouteConfirmed } = useRoutedOrganization();
  const effectiveUserId = userId ?? getPlaywrightAuthState()?.userId ?? null;
  const scopeKey =
    isRouteConfirmed && effectiveUserId && confirmedOrganizationId
      ? `${effectiveUserId}:${confirmedOrganizationId}`
      : null;
  const scope: PersistedQueryCacheScope | null =
    scopeKey && effectiveUserId && confirmedOrganizationId
      ? { organizationId: confirmedOrganizationId, userId: effectiveUserId }
      : null;
  const scopeUserId = scope?.userId ?? null;
  const scopeOrganizationId = scope?.organizationId ?? null;
  const [restoredKey, setRestoredKey] = useState<string | null>(null);
  // Once the tree has mounted it stays: a later scope (an organization switch)
  // is restored behind it. Queries that mount first fetch, and a stored value
  // only fills a query that holds nothing fresher.
  const isRestored =
    scopeKey === null || restoredKey !== null || restoredKey === scopeKey;

  // use-effect-audit: ignore reads the device store once per scope; a stale result is dropped on cleanup
  useEffect(() => {
    if (!scopeKey || !scopeUserId || !scopeOrganizationId) {
      return;
    }

    let isCancelled = false;
    void restorePersistedQueryCache({
      buster: BUILD_ID,
      queryClient,
      scope: { organizationId: scopeOrganizationId, userId: scopeUserId },
      storage,
    }).then(() => {
      if (!isCancelled) {
        setRestoredKey(scopeKey);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [queryClient, scopeKey, scopeOrganizationId, scopeUserId, storage]);

  // use-effect-audit: ignore subscribes to the query cache and the page lifecycle, an outside system
  useEffect(() => {
    if (!isRestored || !scopeUserId || !scopeOrganizationId) {
      return;
    }

    const save = (): void => {
      void savePersistedQueryCache({
        buster: BUILD_ID,
        queryClient,
        scope: { organizationId: scopeOrganizationId, userId: scopeUserId },
        storage,
      });
    };
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        save();
      }, PERSISTED_QUERY_CACHE_WRITE_DELAY_MS);
    };
    // A reload right after the last answer must not lose it.
    const flush = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
        save();
      }
    };

    const unsubscribe = queryClient.getQueryCache().subscribe(schedule);
    window.addEventListener('pagehide', flush);

    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', flush);
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [isRestored, queryClient, scopeOrganizationId, scopeUserId, storage]);

  if (!isRestored) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
