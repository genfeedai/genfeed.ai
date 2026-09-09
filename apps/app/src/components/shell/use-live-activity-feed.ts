'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { PageScope } from '@genfeedai/contracts';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useActivities } from '@hooks/data/activities/use-activities/use-activities';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import {
  getActivityDescription,
  isBackgroundTask,
} from '@pages/activities/activities-list.utils';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';
import {
  getGenerationActivityHref,
  getGenerationActivityStatus,
  isActiveGenerationActivity,
  mergeGenerationActivities,
} from '@/components/shell/generation-activity.utils';
import { useActivityMessageFormatter } from '@/hooks/i18n/useActivityMessageFormatter';

export const LIVE_ACTIVITY_LIMIT = 50;
export const ACTIVITY_RECONCILE_MS = 15_000;
const REFRESH_EVENTS = [
  'background-task-update',
  'notification',
  'ingredient-status',
  'article-status',
  'publication-status',
  'workflow-status',
  'asset-status',
  'training-status',
];

export function useLiveActivityFeed() {
  const { organizationId, isReady: scopeReady } = useCollectionScope();
  const { userId, isSignedIn } = useAuthIdentity();
  const { brands } = useBrand();
  const { orgSlug } = useOrgUrl();
  const router = useRouter();
  const formatter = useActivityMessageFormatter();
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

  useEffect(() => {
    if (!scopeReady || !isSignedIn || !userId || !organizationId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      void client.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'activities' &&
          query.queryKey.includes(organizationId) &&
          query.queryKey.includes(userId),
      });
      void client.invalidateQueries({
        queryKey: ['notification-inbox', userId, organizationId],
      });
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
    // The bell is mounted on every page, so an unconditional interval polled
    // three endpoints forever. Reconcile on a timer only while something is
    // running or the socket cannot deliver updates; focus, visibility, and
    // socket events still refresh on demand.
    const needsPolling = activeCount > 0 || connectionState !== 'connected';
    const interval = needsPolling
      ? setInterval(reconcileVisible, ACTIVITY_RECONCILE_MS)
      : undefined;
    window.addEventListener('focus', reconcileVisible);
    document.addEventListener('visibilitychange', reconcileVisible);
    if (connectionState === 'connected') refresh();
    return () => {
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
      for (const dispose of disposers) dispose();
      window.removeEventListener('focus', reconcileVisible);
      document.removeEventListener('visibilitychange', reconcileVisible);
    };
  }, [
    activeCount,
    client,
    connectionState,
    isReady,
    isSignedIn,
    organizationId,
    scopeReady,
    subscribe,
    userId,
  ]);

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
        ? { actionLabel: 'View', onAction: () => router.push(destination) }
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
    userId,
  ]);

  return {
    ...activity,
    isError: activity.isError || active.isError,
    isLoading: activity.isLoading || active.isLoading,
    filteredActivities: scopedActivities,
    activeCount,
    connectionState,
    getActivityHref: (item: (typeof scopedActivities)[number]) =>
      getGenerationActivityHref(item, { organizationId, orgSlug, brands }),
  };
}
