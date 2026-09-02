import { BaseEntity } from '@api/entities/base.entity';
import { ModelCategory } from '@genfeedai/enums';
import { type ElementCamera } from '@genfeedai/prisma';

export class ElementCameraEntity extends BaseEntity implements ElementCamera {
  declare readonly organizationId: string;

  declare readonly key: string;
  declare readonly label: string;
  declare readonly description: string | null;
  declare readonly category?: ModelCategory;
}
