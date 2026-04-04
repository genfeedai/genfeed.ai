import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ModelCategory } from '@genfeedai/enums';
import type { IElementCameraMovement } from '@genfeedai/interfaces';

export class ElementCameraMovement
  extends BaseEntity
  implements IElementCameraMovement
{
  public declare key: string;
  public declare label: string;
  public declare description?: string;
  public declare category?: ModelCategory;
  public declare isActive?: boolean;
  public declare isDefault?: boolean;

  constructor(data: Partial<IElementCameraMovement> = {}) {
    super(data);
  }
}

export { ElementCameraMovement as CameraMovement };
