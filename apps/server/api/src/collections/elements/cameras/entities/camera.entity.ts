import { ElementCamera } from '@api/collections/elements/cameras/schemas/camera.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { ModelCategory } from '@genfeedai/enums';

export class ElementCameraEntity extends BaseEntity implements ElementCamera {
  declare readonly user?: string;
  declare readonly organization?: string;

  declare readonly key: string;
  declare readonly label: string;
  declare readonly description?: string;
  declare readonly category?: ModelCategory;
}
