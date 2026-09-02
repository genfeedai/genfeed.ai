import { BaseEntity } from '@api/entities/base.entity';
import { VoteEntityModel } from '@genfeedai/contracts';
import { type Vote } from '@genfeedai/prisma';

export class VoteEntity extends BaseEntity implements Vote {
  declare readonly id: string;
  declare readonly organizationId: string;
  declare readonly userId: string;
  declare readonly entityId: string | null;
  declare readonly entityModel: Vote['entityModel'] | VoteEntityModel;
}
