import { Vote } from '@api/collections/votes/schemas/vote.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { VoteEntityModel } from '@genfeedai/enums';

export class VoteEntity extends BaseEntity implements Vote {
  declare readonly user: string;
  declare readonly entityModel: VoteEntityModel;
  declare readonly entity: string;
}
