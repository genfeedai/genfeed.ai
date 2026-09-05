import { UsersService } from '@genfeedai/services/organization/users.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

export function useNotificationInbox(open: boolean) {
  const { organizationId, isReady } = useCollectionScope();
  const { userId, isSignedIn } = useAuthIdentity();
  const getService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );
  const client = useQueryClient();
  const key = ['notification-inbox', userId, organizationId];
  const enabled = isReady && isSignedIn && Boolean(organizationId);
  const count = useQuery({
    queryKey: [...key, 'count', open],
    enabled,
    queryFn: async ({ signal }) =>
      (await getService()).notificationInboxCount(organizationId, signal),
    staleTime: 0,
  });
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
