import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ActionOrigin, ActivityStatus } from '@genfeedai/contracts';
import type {
  IActivity,
  IActivityPostPreview,
  IOrganization,
  IUser,
} from '@genfeedai/contracts/interfaces';

export class Activity extends BaseEntity implements IActivity {
  declare public user: IUser;
  declare public organization?: IOrganization;
  declare public key: string;
  declare public value: string;
  declare public status?: ActivityStatus;
  declare public source: string;
  declare public origin: ActionOrigin;
  declare public isRead: boolean;
  declare public organizationLabel?: string;
  declare public brandLabel?: string;
  declare public userLabel?: string;
  declare public preview?: IActivityPostPreview;

  constructor(data: Partial<IActivity> = {}) {
    super(data);
  }
}
