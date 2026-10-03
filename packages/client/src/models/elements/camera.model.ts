import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { IElementCamera } from '@genfeedai/contracts/interfaces';

export class ElementCamera extends BaseEntity implements IElementCamera {
  declare public key: string;
  declare public label: string;
  declare public description?: string;
  declare public isActive?: boolean;
  declare public isPlatformDefault?: boolean;
  declare public sortOrder?: number;

  constructor(data: Partial<IElementCamera> = {}) {
    super(data);
  }
}

export { ElementCamera as Camera };
