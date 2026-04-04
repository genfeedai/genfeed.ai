import { Member } from '@api/collections/members/schemas/member.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { Types } from 'mongoose';

export class MemberEntity extends BaseEntity implements Member {
  declare readonly organization: Types.ObjectId;
  declare readonly brands: Types.ObjectId[];
  declare readonly user: Types.ObjectId;
  declare readonly role: Types.ObjectId;

  declare readonly isActive: boolean;
}
