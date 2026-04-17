import { ElementCameraMovement } from '@api/collections/elements/camera-movements/schemas/camera-movement.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { ModelCategory } from '@genfeedai/enums';

export class ElementCameraMovementEntity
  extends BaseEntity
  implements ElementCameraMovement
{
  user?: string;
  organization?: string;
  key!: string;
  label!: string;
  description?: string;
  category?: ModelCategory;
  isActive!: boolean;
  isDefault!: boolean;
}
