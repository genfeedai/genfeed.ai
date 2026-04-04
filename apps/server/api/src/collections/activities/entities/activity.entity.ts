import type { Activity } from '@api/collections/activities/schemas/activity.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
} from '@genfeedai/enums';
import type { Types } from 'mongoose';

export class ActivityEntity extends BaseEntity implements Activity {
  declare readonly user: Types.ObjectId;
  declare readonly organization: Types.ObjectId;
  declare readonly brand: Types.ObjectId;

  declare readonly key: ActivityKey;
  declare readonly source: ActivitySource;
  declare readonly value?: string;
  declare readonly entityModel?: ActivityEntityModel;
  declare readonly entityId?: Types.ObjectId;

  declare readonly isRead: boolean;

  constructor(partial: Partial<ActivityEntity>) {
    super(partial);
    Object.assign(this, partial);
  }
}
