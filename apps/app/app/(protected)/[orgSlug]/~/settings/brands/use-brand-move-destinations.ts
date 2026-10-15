import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { useMemberOrganizations } from '@hooks/data/organization/use-member-organizations/use-member-organizations';
import type { BrandMoveDestination } from '@props/settings/brand-move.props';

/**
 * Organizations a brand of `sourceOrganizationId` could move to: the
 * organizations the user belongs to, minus the source, alphabetical. A
 * superadmin gets the same list — the picker never enumerates other tenants.
 * The server still requires owner/admin in both, so a listed destination can
 * be refused later; this only keeps the picker honest.
 */
export function useBrandMoveDestinations(sourceOrganizationId: string | null): {
  destinations: BrandMoveDestination[];
  isSuperAdmin: boolean;
} {
  const { isSuperAdmin } = useAccessState();
  const { organizations } = useMemberOrganizations();

  return {
    destinations: organizations.filter(
      (destination) => destination.id !== sourceOrganizationId,
    ),
    isSuperAdmin,
  };
}
