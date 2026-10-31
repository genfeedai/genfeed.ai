import type { IBrand, IMember, IRole } from '@genfeedai/contracts/interfaces';

export type MemberBrandAccessProps = {
  member: Pick<IMember, 'brands' | 'role' | 'roleKey'>;
};

export interface MemberDetailsProps {
  member: IMember;
  organizationId: string;
  actorRole: string | null | undefined;
  brands: IBrand[];
  roles: IRole[];
  isLoadingRoles: boolean;
  rolesError: string | null;
  onLoadRoles: () => void;
  onUpdated: (member: IMember) => void;
}
