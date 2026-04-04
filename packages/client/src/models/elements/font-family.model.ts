import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ModelCategory } from '@genfeedai/enums';
import type { IFontFamily } from '@genfeedai/interfaces';

export class FontFamily extends BaseEntity implements IFontFamily {
  public declare key: string;
  public declare label: string;
  public declare description?: string;
  public declare category?: ModelCategory;

  constructor(data: Partial<IFontFamily> = {}) {
    super(data);
  }
}
