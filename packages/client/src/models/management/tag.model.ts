import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { TagCategory } from '@genfeedai/enums';
import type { IBrand, IOrganization, ITag, IUser } from '@genfeedai/interfaces';

export class Tag extends BaseEntity implements ITag {
  public declare brand: IBrand;
  public declare user: IUser;
  public declare organization: IOrganization;
  public declare category: TagCategory;
  public declare label: string;
  public declare description?: string;
  public declare key?: string;
  public declare backgroundColor: string;
  public declare textColor: string;
  public declare isActive?: boolean;
  public declare color?: string;

  constructor(data: Partial<ITag> = {}) {
    super(data);
  }
}
