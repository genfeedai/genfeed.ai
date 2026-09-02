import { BaseEntity } from '@api/entities/base.entity';
import { ModelCategory } from '@genfeedai/enums';
import { type ElementCameraMovement } from '@genfeedai/prisma';

export class ElementCameraMovementEntity
  extends BaseEntity
  implements ElementCameraMovement
{
  declare readonly organizationId: string;
  key!: string;
  label!: string;
  declare readonly description: string | null;
  category?: ModelCategory;
  isActive!: boolean;
  isDefault!: boolean;
}
