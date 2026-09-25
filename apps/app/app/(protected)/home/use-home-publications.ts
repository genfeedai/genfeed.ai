import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { useQuery } from '@tanstack/react-query';

export function useHomePublications(organizationId?: string, brandId?: string) {
  const getService = useAuthedService((token: string) =>
    ReleaseGroupsService.getInstance(token),
  );
  const query = useQuery({
    enabled: Boolean(organizationId && brandId),
    queryKey: ['home-publications', organizationId, brandId],
    queryFn: async ({ signal }) => {
      const service = await getService();
      return service.findAll(
        { brandId, limit: 5, sort: 'updatedAt: -1' },
        signal,
      );
    },
  });

  return {
    isError: query.isError,
    isLoading: Boolean(organizationId && brandId) && query.isPending,
    publications: query.data ?? [],
    refresh: async () => {
      await query.refetch();
    },
  };
}
