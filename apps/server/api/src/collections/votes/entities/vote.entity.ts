import { Vote } from '@api/collections/votes/schemas/vote.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { VoteEntityModel } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class VoteEntity extends BaseEntity implements Vote {
  declare readonly user: Types.ObjectId;
  declare readonly entityModel: VoteEntityModel;
  declare readonly entity: Types.ObjectId;
}
