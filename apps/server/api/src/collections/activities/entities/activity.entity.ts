import { BaseEntity } from '@api/entities/base.entity';
import type {
  ActionOrigin,
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
} from '@genfeedai/enums';

export class ActivityEntity extends BaseEntity {
  declare readonly action: string | null;
  declare readonly id: string;
  declare readonly organizationId: string;
  declare readonly userId: string;
  declare readonly brandId: string | null;
  declare readonly data: Record<string, unknown> | null;

  declare readonly key: ActivityKey | string | null;
  declare readonly source: ActivitySource | string | null;
  declare readonly origin: ActionOrigin;
  declare readonly actorUserId: string | null;
  declare readonly apiKeyId: string | null;
  declare readonly value: string | null;
  declare readonly entityModel: ActivityEntityModel | string | null;
  declare readonly entityId: string | null;

  declare readonly isRead: boolean | undefined;

  constructor(partial: Partial<ActivityEntity>) {
    super(partial);
    Object.assign(this, partial);
  }
}
