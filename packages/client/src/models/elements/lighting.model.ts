import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ModelCategory } from '@genfeedai/contracts';
import type { IElementLighting } from '@genfeedai/contracts/interfaces';

export class ElementLighting extends BaseEntity implements IElementLighting {
  declare public key: string;
  declare public label: string;
  declare public description?: string;
  declare public category?: ModelCategory;
  declare public isActive?: boolean;
  declare public isDefault?: boolean;

  constructor(data: Partial<IElementLighting> = {}) {
    super(data);
  }
}

export { ElementLighting as Lighting };
