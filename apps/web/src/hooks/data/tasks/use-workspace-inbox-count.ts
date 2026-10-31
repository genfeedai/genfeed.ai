'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { TasksService } from '@services/management/tasks.service';
import { useQuery } from '@tanstack/react-query';

/**
 * The rail and menu badge polls on every page and only needs the unread count,
 * so it asks for the count without the receipt list. Its key extends the
 * read-state key, so saving a receipt (which invalidates that key) refreshes it.
 */
export function useWorkspaceInboxCount(): number {
  const { getToken, orgId, userId } = useAuthIdentity();
  const { organizationId: workspaceOrganizationId } = useBrand();
  const scopeId = orgId || workspaceOrganizationId || 'session';
  const state = useQuery({
    enabled: Boolean(userId),
    queryFn: async ({ signal }) => {
      const token = await resolveAuthToken(getToken);
      if (!token) throw new Error('Authentication required');
      return TasksService.getInstance(token).findInboxReadState(signal, {
        countOnly: true,
      });
    },
    queryKey: ['workspace-inbox-read', userId, scopeId, 'count'],
    refetchInterval: 60_000,
  });
  return state.data?.unreadCount ?? 0;
}
