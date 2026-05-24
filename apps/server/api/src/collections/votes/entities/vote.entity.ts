import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { VoteEntityModel } from '@genfeedai/enums';
import { type Vote } from '@genfeedai/prisma';

export class VoteEntity extends BaseEntity implements Vote {
  declare readonly id: string;
  declare readonly mongoId: string | null;
  declare readonly organizationId: string;
  declare readonly userId: string;
  declare readonly entityId: string | null;
  declare readonly entityModel: Vote['entityModel'] | VoteEntityModel;

  declare readonly user?: string;
  declare readonly entity?: string;
}
