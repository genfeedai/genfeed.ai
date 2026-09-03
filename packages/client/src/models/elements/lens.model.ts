import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ModelCategory } from '@genfeedai/contracts';
import type { IElementLens } from '@genfeedai/contracts/interfaces';

export class ElementLens extends BaseEntity implements IElementLens {
  declare public key: string;
  declare public label: string;
  declare public description?: string;
  declare public category?: ModelCategory;
  declare public isActive?: boolean;
  declare public isDefault?: boolean;

  constructor(data: Partial<IElementLens> = {}) {
    super(data);
  }
}

export { ElementLens as Lens };
