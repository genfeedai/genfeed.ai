import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  IBrand,
  IMember,
  IOrganization,
  IRole,
  IUser,
} from '@genfeedai/contracts/interfaces';

export class Member extends BaseEntity implements IMember {
  declare public organizationId: string;
  declare public userId: string;
  declare public roleId: string;
  declare public lastUsedBrandId?: string | null;
  declare public roleKey?: string | null;
  declare public organization?: IOrganization;
  declare public user?: IUser;
  declare public role?: IRole;
  declare public brands?: IBrand[];
  declare public isActive: boolean;

  constructor(data: Partial<IMember> = {}) {
    super(data);
  }
}
