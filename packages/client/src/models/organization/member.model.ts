import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  IBrand,
  IMember,
  IOrganization,
  IRole,
  IUser,
} from '@genfeedai/contracts/interfaces';

export class Member extends BaseEntity implements IMember {
  public declare organizationId: string;
  public declare userId: string;
  public declare roleId: string;
  public declare lastUsedBrandId?: string | null;
  public declare roleKey?: string | null;
  public declare organization?: IOrganization;
  public declare user?: IUser;
  public declare role?: IRole;
  public declare brands?: IBrand[];
  public declare isActive: boolean;

  constructor(data: Partial<IMember> = {}) {
    super(data);
  }
}
