import type {
  MemberOrganizationOption,
  UseMemberOrganizationsReturn,
} from '@genfeedai/contracts/interfaces/hooks/hooks.interface';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery } from '@tanstack/react-query';

export const MEMBER_ORGANIZATIONS_QUERY_KEY = ['member-organizations'] as const;

export function sortMemberOrganizations(
  organizations: readonly MemberOrganizationOption[],
): MemberOrganizationOption[] {
  return [...organizations].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  );
}

/**
 * Organizations the signed-in user belongs to, alphabetical. The single
 * source for organization pickers (brand move, brand modal): a superadmin gets
 * the same list, so no picker enumerates other tenants.
 */
export function useMemberOrganizations(): UseMemberOrganizationsReturn {
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const { data, isLoading } = useQuery({
    queryFn: async (): Promise<MemberOrganizationOption[]> => {
      const service = await getOrganizationsService();
      const organizations = await service.getMyOrganizations();
      return sortMemberOrganizations(
        organizations.map(({ id, label }) => ({ id, label })),
      );
    },
    queryKey: MEMBER_ORGANIZATIONS_QUERY_KEY,
  });

  return { isLoading, organizations: data ?? [] };
}
