import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ActivityStatus } from '@genfeedai/enums';
import type { IActivity, IOrganization, IUser } from '@genfeedai/interfaces';

export class Activity extends BaseEntity implements IActivity {
  public declare user: IUser;
  public declare organization?: IOrganization;
  public declare key: string;
  public declare value: string;
  public declare status?: ActivityStatus;
  public declare source: string;
  public declare isRead: boolean;

  constructor(data: Partial<IActivity> = {}) {
    super(data);
  }
}
