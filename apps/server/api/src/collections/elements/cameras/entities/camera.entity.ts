import { BaseEntity } from '@api/entities/base.entity';
import { ModelCategory } from '@genfeedai/contracts';
import { type ElementCamera } from '@genfeedai/prisma';

export class ElementCameraEntity extends BaseEntity implements ElementCamera {
  declare readonly organizationId: string | null;
  declare readonly isActive: boolean;
  declare readonly sortOrder: number;

  declare readonly key: string;
  declare readonly label: string;
  declare readonly description: string | null;
  declare readonly category?: ModelCategory;
}
