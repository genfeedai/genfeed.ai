import { Activity } from '@api/collections/activities/schemas/activity.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
} from '@genfeedai/enums';

export class ActivityEntity extends BaseEntity implements Activity {
  declare readonly user: string;
  declare readonly organization: string;
  declare readonly brand: string;

  declare readonly key: ActivityKey;
  declare readonly source: ActivitySource;
  declare readonly value?: string;
  declare readonly entityModel?: ActivityEntityModel;
  declare readonly entityId?: string;

  declare readonly isRead: boolean;

  constructor(partial: Partial<ActivityEntity>) {
    super(partial);
    Object.assign(this, partial);
  }
}
