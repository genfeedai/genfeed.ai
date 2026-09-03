import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ModelCategory } from '@genfeedai/contracts';
import type { IFontFamily } from '@genfeedai/contracts/interfaces';

export class FontFamily extends BaseEntity implements IFontFamily {
  declare public key: string;
  declare public label: string;
  declare public description?: string;
  declare public category?: ModelCategory;

  constructor(data: Partial<IFontFamily> = {}) {
    super(data);
  }
}
