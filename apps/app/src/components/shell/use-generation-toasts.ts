'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { PageScope } from '@genfeedai/contracts';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useActivities } from '@hooks/data/activities/use-activities/use-activities';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { onForeground } from '@hooks/utils/on-foreground/on-foreground';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import {
  getActivityDescription,
  isBackgroundTask,
} from '@pages/activities/activities-list.utils';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  getGenerationActivityHref,
  getGenerationActivityStatus,
  isActiveGenerationActivity,
  mergeGenerationActivities,
} from '@/components/shell/generation-activity.utils';
import { useActivityMessageFormatter } from '@/hooks/i18n/useActivityMessageFormatter';

export const LIVE_ACTIVITY_LIMIT = 50;
export const ACTIVITY_RECONCILE_MS = 15_000;
/** A connect-time reconcile skips activity reads newer than this. */
export const ACTIVITY_CONNECT_FRESH_MS = 5_000;
const REFRESH_EVENTS = [
  'background-task-update',
  'ingredient-status',
  'article-status',
  'publication-status',
  'workflow-status',
  'asset-status',
  'training-status',
];

/**
 * Toasts the signed-in user's own generation completions and failures. The
 * bell shows alerts only (#5197); the full history lives on the activities
 * pages. This hook reads the scoped activity records the socket and focus
 * refreshes, and polls only while a generation is running or the socket is
 * down.
 */
export function useGenerationToasts(): void {
  const { organizationId, isReady: scopeReady } = useCollectionScope();
  const { userId, isSignedIn } = useAuthIdentity();
  const { brands } = useBrand();
  const { orgSlug } = useOrgUrl();
  const router = useRouter();
  const formatter = useActivityMessageFormatter();
  const translateActivity = useTranslations('common.activity');
  const client = useQueryClient();
  const { isReady, subscribe, connectionState } = useSocketManager();
  const activity = useActivities({
    limit: LIVE_ACTIVITY_LIMIT,
    sort: 'updatedAt: -1',
    scope: PageScope.ORGANIZATION,
    autoLoad: scopeReady && isSignedIn,
  });
  const active = useActivities({
    limit: 100,
    activeOnly: true,
    scope: PageScope.ORGANIZATION,
    autoLoad: scopeReady && isSignedIn,
  });
  const seen = useRef<{
    scope: string;
    statuses: Map<string, string>;
    initialized: boolean;
    since: number;
  }>({ scope: '', statuses: new Map(), initialized: false, since: Date.now() });
  const scopedActivities = useMemo(
    () =>
      mergeGenerationActivities(
        activity.filteredActivities,
        active.filteredActivities,
        organizationId,
      ),
    [activity.filteredActivities, active.filteredActivities, organizationId],
  );
  const scopeKey = `${userId ?? ''}:${organizationId}`;
  const activeCount = useMemo(
    () => scopedActivities.filter(isActiveGenerationActivity).length,
    [scopedActivities],
  );

  const isActivityScopeReady =
    scopeReady && isSignedIn && Boolean(userId) && Boolean(organizationId);
  const isScopedActivityQuery = useCallback(
    (queryKey: readonly unknown[]) =>
      queryKey[0] === 'activities' &&
      queryKey.includes(organizationId) &&
      queryKey.includes(userId),
    [organizationId, userId],
  );

  useEffect(() => {
    if (!isActivityScopeReady) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      void client.invalidateQueries(
        { predicate: (query) => isScopedActivityQuery(query.queryKey) },
        // A read already in flight is current: never cancel and re-send it.
        { cancelRefetch: false },
      );
    };
    // Socket payloads only trigger authenticated reads; they never become UI data.
    const scheduleRefresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        refresh();
      }, 150);
    };
    const disposers = isReady
      ? REFRESH_EVENTS.map((event) => subscribe(event, scheduleRefresh))
      : [];
    const reconcileVisible = () => {
      if (document.visibilityState !== 'hidden') refresh();
    };
    // Mounted on every page: reconcile on a timer only while something is
    // running or the socket cannot deliver updates; focus, visibility, and
    // socket events still refresh on demand.
    const needsPolling = activeCount > 0 || connectionState !== 'connected';
    const interval = needsPolling
      ? setInterval(reconcileVisible, ACTIVITY_RECONCILE_MS)
      : undefined;
    const disposeForeground = onForeground(refresh);
    return () => {
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
      for (const dispose of disposers) dispose();
      disposeForeground();
    };
  }, [
    activeCount,
    client,
    connectionState,
    isActivityScopeReady,
    isReady,
    isScopedActivityQuery,
    subscribe,
  ]);

  // Catch up on events missed while the socket was down, once per (re)connect.
  // Not part of the effect above: that one re-runs whenever the active count
  // changes, which would re-read both lists on every status change. Reads
  // fetched moments ago (the mount reads) are already current.
  useEffect(() => {
    if (!isActivityScopeReady || connectionState !== 'connected') return;
    void client.invalidateQueries(
      {
        predicate: (query) =>
          isScopedActivityQuery(query.queryKey) &&
          Date.now() - query.state.dataUpdatedAt > ACTIVITY_CONNECT_FRESH_MS,
      },
      { cancelRefetch: false },
    );
  }, [client, connectionState, isActivityScopeReady, isScopedActivityQuery]);

  useEffect(() => {
    if (seen.current.scope !== scopeKey)
      seen.current = {
        scope: scopeKey,
        statuses: new Map(),
        initialized: false,
        since: Date.now(),
      };
    if (
      activity.isLoading ||
      activity.isError ||
      active.isLoading ||
      active.isError
    )
      return;
    const baseline = !seen.current.initialized;
    for (const item of scopedActivities) {
      if (item.organizationId !== organizationId || !isBackgroundTask(item))
        continue;
      const status = getGenerationActivityStatus(item);
      const previous = seen.current.statuses.get(item.id);
      seen.current.statuses.set(item.id, status);
      if (
        baseline ||
        previous === status ||
        (!previous &&
          Date.parse(item.updatedAt || item.createdAt) < seen.current.since) ||
        (item.userId ?? item.user?.id) !== userId
      )
        continue;
      if (status !== 'ready' && status !== 'failed') continue;
      const destination = getGenerationActivityHref(item, {
        organizationId,
        orgSlug,
        brands,
      });
      const options = destination
        ? {
            actionLabel: translateActivity('view'),
            onAction: () => router.push(destination),
          }
        : undefined;
      const notifications = NotificationsService.getInstance();
      const title = getActivityDescription(item, formatter);
      if (status === 'ready') notifications.success(title, options);
      else notifications.warning(title, options);
    }
    seen.current.initialized = true;
  }, [
    scopedActivities,
    activity.isError,
    activity.isLoading,
    active.isError,
    active.isLoading,
    brands,
    formatter,
    organizationId,
    orgSlug,
    router,
    scopeKey,
    translateActivity,
    userId,
  ]);
}
