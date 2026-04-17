import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { ModelCategory } from '@genfeedai/enums';
import { type ElementLens } from '@genfeedai/prisma';

export class ElementLensEntity extends BaseEntity implements ElementLens {
  user?: string;
  organization?: string;
  key!: string;
  label!: string;
  description?: string;
  category?: ModelCategory;
  isActive!: boolean;
  isDefault!: boolean;
}
