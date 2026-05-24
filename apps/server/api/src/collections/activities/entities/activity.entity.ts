import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
} from '@genfeedai/enums';

export class ActivityEntity extends BaseEntity {
  declare readonly action: string | null;
  declare readonly user: string | null;
  declare readonly organization: string | null;
  declare readonly brand: string | null;
  declare readonly id: string;
  declare readonly mongoId: string | null;
  declare readonly organizationId: string;
  declare readonly userId: string;
  declare readonly brandId: string | null;
  declare readonly data: Record<string, unknown> | null;

  declare readonly key: ActivityKey | string | null;
  declare readonly source: ActivitySource | string | null;
  declare readonly value: string | null;
  declare readonly entityModel: ActivityEntityModel | string | null;
  declare readonly entityId: string | null;

  declare readonly isRead: boolean | undefined;

  constructor(partial: Partial<ActivityEntity>) {
    super(partial);
    Object.assign(this, partial);
  }
}
