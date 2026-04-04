import { ElementLens } from '@api/collections/elements/lenses/schemas/lens.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { ModelCategory } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class ElementLensEntity extends BaseEntity implements ElementLens {
  user?: Types.ObjectId;
  organization?: Types.ObjectId;
  key!: string;
  label!: string;
  description?: string;
  category?: ModelCategory;
  isActive!: boolean;
  isDefault!: boolean;
}
