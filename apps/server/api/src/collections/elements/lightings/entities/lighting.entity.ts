import { BaseEntity } from '@api/entities/base.entity';
import { ModelCategory } from '@genfeedai/contracts';
import { type ElementLighting } from '@genfeedai/prisma';

export class ElementLightingEntity
  extends BaseEntity
  implements ElementLighting
{
  declare readonly organizationId: string;
  key!: string;
  label!: string;
  declare readonly description: string | null;
  category?: ModelCategory;
  isActive!: boolean;
  isDefault!: boolean;
}
