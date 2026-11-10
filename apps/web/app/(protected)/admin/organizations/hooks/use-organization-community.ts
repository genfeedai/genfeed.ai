import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminCommunityService } from '@services/admin/community.service';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { OrganizationCommunityAction } from '@/features/admin/props/organization-community.props';

const COMMUNITY_QUERY_KEY = 'admin-organization-community';

/**
 * One organization on genfeed.ai/community: its public creators and a page of
 * its public media, and the operator writes that feature them or take them
 * off. Every write reloads the view, so it shows what community now shows.
 */
export function useOrganizationCommunity(organizationId: string, page: number) {
  const queryClient = useQueryClient();
  const getService = useAuthedService((token: string) =>
    AdminCommunityService.getInstance(token),
  );

  const query = useQuery({
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) =>
      (await getService()).getOverview(organizationId, page, signal),
    queryKey: [COMMUNITY_QUERY_KEY, organizationId, page],
  });

  const mutation = useMutation({
    mutationFn: async (action: OrganizationCommunityAction) => {
      const service = await getService();
      if (action.kind === 'feature') {
        await service.setFeatured(
          organizationId,
          action.target,
          action.id,
          action.isFeatured,
        );
        return;
      }
      await service.unpublish(organizationId, action.target, action.id);
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: [COMMUNITY_QUERY_KEY, organizationId],
      }),
  });

  return {
    apply: mutation.mutateAsync,
    data: query.data,
    isError: query.isError,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    isSaving: mutation.isPending,
    refetch: query.refetch,
  };
}
