import type { IBaseEntity } from '../index';
import { IBrand, IOrganization, IRole, IUser } from '../index';

export interface IMemberInvitation {
  email: string;
  firstName?: string;
  lastName?: string;
  role: string; // Role ID
}

export interface IMember extends IBaseEntity {
  organization: IOrganization;
  user: IUser;
  role: IRole;
  brands?: IBrand[];
  isActive: boolean;
  isDeleted: boolean;
  userFullName?: string;
  userEmail?: string;
  roleLabel?: string;
}
