import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { ModelCategory } from '@genfeedai/enums';
import { type ElementLighting } from '@genfeedai/prisma';

export class ElementLightingEntity
  extends BaseEntity
  implements ElementLighting
{
  user?: string;
  organization?: string;
  key!: string;
  label!: string;
  declare readonly description: string | null;
  category?: ModelCategory;
  isActive!: boolean;
  isDefault!: boolean;
}
