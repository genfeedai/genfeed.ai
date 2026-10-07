import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';

export type TenantReadIdentity = Pick<
  AuthenticatedUser,
  'organizationId' | 'brandId'
>;

export interface ITenantReadScope {
  readonly organizationId: string;
  readonly brandId?: string;
  readonly isOrganizationOverride: boolean;
}
