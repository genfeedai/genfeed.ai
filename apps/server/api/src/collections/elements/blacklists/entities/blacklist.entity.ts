import { BaseEntity } from '@api/entities/base.entity';
import { ModelCategory } from '@genfeedai/contracts';
import { type ElementBlacklist } from '@genfeedai/prisma';

export class ElementBlacklistEntity
  extends BaseEntity
  implements ElementBlacklist
{
  declare readonly organizationId: string | null;

  label!: string;
  declare readonly description: string | null;
  key!: string;
  category!: ModelCategory;

  declare readonly isActive: boolean;
  declare readonly isDefault: boolean;
  declare readonly sortOrder: number;
  reason?: string;
  expiresAt?: Date;
}
