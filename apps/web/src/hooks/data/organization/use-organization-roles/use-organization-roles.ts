'use client';

import type { IRole } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { RolesService } from '@services/organization/roles.service';
import type { UseQueryResult } from '@tanstack/react-query';

export const ORGANIZATION_ROLES_QUERY_KEY = ['organization-roles'] as const;

/**
 * The roles a member can hold, cached per viewer. The invite dialog and the
 * member sidebar share it, so reopening either paints the roles at once and
 * refreshes them in the background. `enabled: false` holds the read until a
 * surface needs it.
 */
export function useOrganizationRoles(
  enabled = true,
): UseQueryResult<IRole[], Error> {
  return useAuthedQuery<RolesService, IRole[]>({
    enabled,
    queryFn: (service, signal) => service.findAll({}, signal),
    queryKey: ORGANIZATION_ROLES_QUERY_KEY,
    service: (token: string) => RolesService.getInstance(token),
  });
}
