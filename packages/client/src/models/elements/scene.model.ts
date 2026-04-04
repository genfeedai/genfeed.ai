import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ModelCategory } from '@genfeedai/enums';
import type { IElementScene } from '@genfeedai/interfaces';

export class ElementScene extends BaseEntity implements IElementScene {
  public declare key: string;
  public declare label: string;
  public declare description?: string;
  public declare category?: ModelCategory;
  public declare isFavorite?: boolean;

  constructor(data: Partial<IElementScene> = {}) {
    super(data);
  }
}

export { ElementScene as Scene };
