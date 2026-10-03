import { BaseEntity } from '@api/entities/base.entity';
import { ModelCategory } from '@genfeedai/contracts';
import { type ElementLens } from '@genfeedai/prisma';

export class ElementLensEntity extends BaseEntity implements ElementLens {
  declare readonly organizationId: string | null;
  declare readonly sortOrder: number;
  key!: string;
  label!: string;
  declare readonly description: string | null;
  category?: ModelCategory;
  isActive!: boolean;
  isDefault!: boolean;
}
