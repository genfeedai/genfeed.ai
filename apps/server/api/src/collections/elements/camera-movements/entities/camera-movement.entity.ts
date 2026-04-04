import { ElementCameraMovement } from '@api/collections/elements/camera-movements/schemas/camera-movement.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { ModelCategory } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class ElementCameraMovementEntity
  extends BaseEntity
  implements ElementCameraMovement
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
