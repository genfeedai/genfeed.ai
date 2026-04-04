import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { IElementCamera } from '@genfeedai/interfaces';

export class ElementCamera extends BaseEntity implements IElementCamera {
  public declare key: string;
  public declare label: string;
  public declare description?: string;

  constructor(data: Partial<IElementCamera> = {}) {
    super(data);
  }
}

export { ElementCamera as Camera };
