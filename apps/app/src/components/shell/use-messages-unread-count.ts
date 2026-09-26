import { SocialMessagesService } from '@genfeedai/services/social/messages.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { NOTIFICATION_INBOX_QUERY_KEY } from '@/components/shell/use-notification-inbox';

/** Root query key of the Messages nav badge. */
export const MESSAGES_UNREAD_COUNT_QUERY_KEY = 'messages-unread-count';

const MESSAGES_UNREAD_REFRESH_MS = 60_000;

/**
 * Unread conversations for the Messages nav badge: the given brand, or every
 * brand in the organization when no brand is in scope. Polls on an interval;
 * the Messages page invalidates it as soon as a thread is read.
 *
 * `isBrandScopeResolved` (default `true`) must be `false` while a
 * brand-scoped route hasn't resolved which brand it means yet — never fetch
 * in that gap, or the badge fetches the org-wide count and then swaps to the
 * brand count once it loads, flashing the wrong number.
 */
export function useMessagesUnreadCount(
  brandId?: string,
  isBrandScopeResolved = true,
) {
  const { organizationId, isReady } = useCollectionScope();
  const { userId, isSignedIn } = useAuthIdentity();
  const getService = useAuthedService((token: string) =>
    SocialMessagesService.getInstance(token),
  );
  const query = useQuery({
    queryKey: [
      MESSAGES_UNREAD_COUNT_QUERY_KEY,
      userId,
      organizationId,
      brandId ?? null,
    ],
    enabled:
      isBrandScopeResolved && isReady && isSignedIn && Boolean(organizationId),
    queryFn: async ({ signal }) =>
      (await getService()).unreadCount(
        brandId ? { brandId } : { allBrands: true },
        signal,
      ),
    refetchInterval: MESSAGES_UNREAD_REFRESH_MS,
    staleTime: MESSAGES_UNREAD_REFRESH_MS / 2,
  });
  return query.data?.unreadCount ?? 0;
}

/** Refreshes both unread indicators (bell and Messages badge). */
export function useRefreshInboxIndicators() {
  const client = useQueryClient();
  return useCallback(() => {
    void client.invalidateQueries({
      queryKey: [NOTIFICATION_INBOX_QUERY_KEY],
    });
    void client.invalidateQueries({
      queryKey: [MESSAGES_UNREAD_COUNT_QUERY_KEY],
    });
  }, [client]);
}
