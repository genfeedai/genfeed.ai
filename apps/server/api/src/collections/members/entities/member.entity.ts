import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { type Member } from '@genfeedai/prisma';

export class MemberEntity extends BaseEntity implements Member {
  declare readonly organizationId: string;
  declare readonly userId: string;
  declare readonly roleId: string;
  declare readonly lastUsedBrandId: string | null;
  declare readonly organization: string;
  declare readonly brands: string[];
  declare readonly user: string;
  declare readonly role: string;

  declare readonly isActive: boolean;
}
