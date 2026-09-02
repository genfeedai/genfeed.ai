import { BaseEntity } from '@api/entities/base.entity';
import { ModelCategory } from '@genfeedai/enums';
import { type ElementLens } from '@genfeedai/prisma';

export class ElementLensEntity extends BaseEntity implements ElementLens {
  declare readonly organizationId: string;
  key!: string;
  label!: string;
  declare readonly description: string | null;
  category?: ModelCategory;
  isActive!: boolean;
  isDefault!: boolean;
}
