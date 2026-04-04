import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  IBrand,
  IMember,
  IOrganization,
  IRole,
  IUser,
} from '@genfeedai/interfaces';

export class Member extends BaseEntity implements IMember {
  public declare organization: IOrganization;
  public declare user: IUser;
  public declare role: IRole;
  public declare brands?: IBrand[];
  public declare isActive: boolean;

  constructor(data: Partial<IMember> = {}) {
    super(data);
  }
}
