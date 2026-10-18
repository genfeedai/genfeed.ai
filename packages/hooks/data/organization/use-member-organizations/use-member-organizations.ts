import type {
  MemberOrganizationOption,
  UseMemberOrganizationsReturn,
} from '@genfeedai/contracts/interfaces/hooks/hooks.interface';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
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
  const { userId, sessionId } = useAuthIdentity();
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const { data, isLoading } = useQuery({
    queryFn: async ({ signal }): Promise<MemberOrganizationOption[]> => {
      signal.throwIfAborted();
      const service = await getOrganizationsService();
      signal.throwIfAborted();
      const organizations = await service.getMyOrganizations();
      signal.throwIfAborted();
      return sortMemberOrganizations(
        organizations.map(({ id, label }) => ({ id, label })),
      );
    },
    queryKey: [
      ...MEMBER_ORGANIZATIONS_QUERY_KEY,
      userId ?? null,
      sessionId ?? null,
      EnvironmentService.apiEndpoint,
    ],
  });

  return { isLoading, organizations: data ?? [] };
}
