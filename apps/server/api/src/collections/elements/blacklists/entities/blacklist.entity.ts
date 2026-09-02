import { BaseEntity } from '@api/entities/base.entity';
import { ModelCategory } from '@genfeedai/contracts';
import { type ElementBlacklist } from '@genfeedai/prisma';

export class ElementBlacklistEntity
  extends BaseEntity
  implements ElementBlacklist
{
  declare readonly organizationId: string;

  label!: string;
  declare readonly description: string | null;
  key!: string;
  category!: ModelCategory;

  isActive!: boolean;
  isDefault!: boolean;
  reason?: string;
  expiresAt?: Date;
}
