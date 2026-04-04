import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ModelCategory } from '@genfeedai/enums';
import type { IElementStyle } from '@genfeedai/interfaces';

export class ElementStyle extends BaseEntity implements IElementStyle {
  public declare key: string;
  public declare label: string;
  public declare description?: string;
  public declare category?: ModelCategory;
  public declare models?: string[];

  constructor(data: Partial<IElementStyle> = {}) {
    super(data);
  }
}

export { ElementStyle as Style };
