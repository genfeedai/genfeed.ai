import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ModelCategory } from '@genfeedai/contracts';
import type { IElementScene } from '@genfeedai/contracts/interfaces';

export class ElementScene extends BaseEntity implements IElementScene {
  declare public key: string;
  declare public label: string;
  declare public description?: string;
  declare public category?: ModelCategory;
  declare public isFavorite?: boolean;

  constructor(data: Partial<IElementScene> = {}) {
    super(data);
  }
}

export { ElementScene as Scene };
