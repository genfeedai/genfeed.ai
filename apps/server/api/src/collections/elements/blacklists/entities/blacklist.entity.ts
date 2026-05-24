import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { ModelCategory } from '@genfeedai/enums';
import { type ElementBlacklist } from '@genfeedai/prisma';

export class ElementBlacklistEntity
  extends BaseEntity
  implements ElementBlacklist
{
  organization?: string;

  label!: string;
  declare readonly description: string | null;
  key!: string;
  category!: ModelCategory;

  isActive!: boolean;
  isDefault!: boolean;
  reason?: string;
  expiresAt?: Date;
}
