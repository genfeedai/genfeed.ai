import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ModelCategory } from '@genfeedai/contracts';
import type { IElementStyle } from '@genfeedai/contracts/interfaces';

export class ElementStyle extends BaseEntity implements IElementStyle {
  declare public key: string;
  declare public label: string;
  declare public description?: string;
  declare public category?: ModelCategory;
  declare public models?: string[];

  constructor(data: Partial<IElementStyle> = {}) {
    super(data);
  }
}

export { ElementStyle as Style };
