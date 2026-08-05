import type {
  IBaseEntity,
  IBrand,
  IOrganization,
  IRole,
  IUser,
} from '../index';

export interface IMemberInvitation {
  email: string;
  firstName?: string;
  lastName?: string;
  roleId: string;
}

export interface IMember extends IBaseEntity {
  organizationId: string;
  userId: string;
  roleId: string;
  lastUsedBrandId?: string | null;
  roleKey?: string | null;
  organization?: IOrganization;
  user?: IUser;
  role?: IRole;
  brands?: IBrand[];
  isActive: boolean;
  isDeleted: boolean;
  userFullName?: string;
  userEmail?: string;
  roleLabel?: string;
}
