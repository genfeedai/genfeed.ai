import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { BrandMoveDestination } from '@props/settings/brand-move.props';
import { OrganizationsService } from '@services/organization/organizations.service';
import { useQuery } from '@tanstack/react-query';

/**
 * Organizations a brand of `sourceOrganizationId` could move to: every
 * organization for a superadmin, otherwise the user's own, minus the source.
 * The server still requires owner/admin in both, so a listed destination can
 * be refused later; this only keeps the picker honest.
 */
export function useBrandMoveDestinations(sourceOrganizationId: string | null): {
  destinations: BrandMoveDestination[];
  isSuperAdmin: boolean;
} {
  const { isSuperAdmin } = useAccessState();
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const { data } = useQuery({
    queryFn: async (): Promise<BrandMoveDestination[]> => {
      const service = await getOrganizationsService();
      const organizations = isSuperAdmin
        ? await service.getAllOrganizations()
        : await service.getMyOrganizations();
      return organizations.map(({ id, label }) => ({ id, label }));
    },
    queryKey: ['brand-move-destinations', isSuperAdmin],
  });

  return {
    destinations: (data ?? []).filter(
      (destination) => destination.id !== sourceOrganizationId,
    ),
    isSuperAdmin,
  };
}
