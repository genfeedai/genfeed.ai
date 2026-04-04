import { ElementLighting } from '@api/collections/elements/lightings/schemas/lighting.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { ModelCategory } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class ElementLightingEntity
  extends BaseEntity
  implements ElementLighting
{
  user?: Types.ObjectId;
  organization?: Types.ObjectId;
  key!: string;
  label!: string;
  description?: string;
  category?: ModelCategory;
  isActive!: boolean;
  isDefault!: boolean;
}
