import { Member } from '@api/collections/members/schemas/member.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';

export class MemberEntity extends BaseEntity implements Member {
  declare readonly organization: string;
  declare readonly brands: string[];
  declare readonly user: string;
  declare readonly role: string;

  declare readonly isActive: boolean;
}
