'use client';

import { ActivitiesService } from '@genfeedai/services/social/activities.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useQuery } from '@tanstack/react-query';

/**
 * Unread activities for the active brand (else the organization), for the dot
 * on the Activity menu item. The key starts with `activities` and carries the
 * user and organization, so the shell's socket refresh and a mark-as-read both
 * refresh it with the list.
 */
export function useUnreadActivityCount(): number {
  const { getToken, userId } = useAuthIdentity();
  const { brandId, organizationId } = useCollectionScope();
  const scope = brandId ? { brandId } : { organizationId };
  const hasScope = Boolean(brandId || organizationId);
  const state = useQuery({
    enabled: Boolean(userId) && hasScope,
    queryFn: async ({ signal }) => {
      const token = await resolveAuthToken(getToken);
      if (!token) throw new Error('Authentication required');
      return ActivitiesService.getInstance(token).getUnreadCount(scope, signal);
    },
    queryKey: [
      'activities',
      userId ?? null,
      'unread-count',
      organizationId ?? null,
      brandId ?? null,
    ],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return state.data ?? 0;
}
