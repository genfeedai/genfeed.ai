import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ModelCategory } from '@genfeedai/contracts';
import type { IElementCameraMovement } from '@genfeedai/contracts/interfaces';

export class ElementCameraMovement
  extends BaseEntity
  implements IElementCameraMovement
{
  declare public key: string;
  declare public label: string;
  declare public description?: string;
  declare public category?: ModelCategory;
  declare public isActive?: boolean;
  declare public isDefault?: boolean;

  constructor(data: Partial<IElementCameraMovement> = {}) {
    super(data);
  }
}

export { ElementCameraMovement as CameraMovement };
