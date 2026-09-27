import { UsersService } from '@genfeedai/services/organization/users.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';

/** Root query key of the bell; invalidating it refreshes count and history. */
export const NOTIFICATION_INBOX_QUERY_KEY = 'notification-inbox';
/** The server's "your inbox changed" socket event (payload names the org). */
export const NOTIFICATION_INBOX_EVENT = 'notification-inbox';
/** Reconcile interval, used only while the socket cannot deliver updates. */
export const NOTIFICATION_INBOX_RECONCILE_MS = 15_000;

export function useNotificationInbox(open: boolean) {
  const { organizationId, isReady } = useCollectionScope();
  const { userId, isSignedIn } = useAuthIdentity();
  const getService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );
  const client = useQueryClient();
  const {
    isReady: isSocketReady,
    subscribe,
    connectionState,
  } = useSocketManager();
  const key = [NOTIFICATION_INBOX_QUERY_KEY, userId, organizationId];
  const enabled = isReady && isSignedIn && Boolean(organizationId);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      void client.invalidateQueries({
        queryKey: [NOTIFICATION_INBOX_QUERY_KEY, userId, organizationId],
      });
    };
    const reconcileVisible = () => {
      if (document.visibilityState !== 'hidden') refresh();
    };
    // The event payload only names the organization; it never becomes UI
    // data. Another organization's refresh is ignored.
    const dispose = isSocketReady
      ? subscribe(NOTIFICATION_INBOX_EVENT, (payload: unknown) => {
          const target =
            typeof payload === 'object' && payload !== null
              ? Reflect.get(payload, 'organizationId')
              : undefined;
          if (target === undefined || target === organizationId) refresh();
        })
      : undefined;
    const interval =
      connectionState === 'connected'
        ? undefined
        : setInterval(reconcileVisible, NOTIFICATION_INBOX_RECONCILE_MS);
    window.addEventListener('focus', reconcileVisible);
    document.addEventListener('visibilitychange', reconcileVisible);
    return () => {
      dispose?.();
      if (interval) clearInterval(interval);
      window.removeEventListener('focus', reconcileVisible);
      document.removeEventListener('visibilitychange', reconcileVisible);
    };
  }, [
    client,
    connectionState,
    enabled,
    isSocketReady,
    organizationId,
    subscribe,
    userId,
  ]);
  const count = useQuery({
    queryKey: [...key, 'count'],
    enabled,
    queryFn: async ({ signal }) =>
      (await getService()).notificationInboxCount(organizationId, signal),
    staleTime: 0,
  });
  const refreshCount = count.refetch;
  useEffect(() => {
    if (open && enabled) void refreshCount();
  }, [open, enabled, refreshCount]);
  const history = useInfiniteQuery({
    queryKey: [...key, 'history'],
    enabled: enabled && open,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      (await getService()).findNotificationInbox(
        organizationId,
        pageParam,
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 0,
  });
  const read = useMutation({
    mutationKey: key,
    mutationFn: async (ids: string[] | null) =>
      (await getService()).readNotificationInbox(organizationId, ids),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: key });
    },
  });
  return { count, history, read, organizationId };
}
