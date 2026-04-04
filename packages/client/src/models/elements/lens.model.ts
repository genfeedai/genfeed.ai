import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ModelCategory } from '@genfeedai/enums';
import type { IElementLens } from '@genfeedai/interfaces';

export class ElementLens extends BaseEntity implements IElementLens {
  public declare key: string;
  public declare label: string;
  public declare description?: string;
  public declare category?: ModelCategory;
  public declare isActive?: boolean;
  public declare isDefault?: boolean;

  constructor(data: Partial<IElementLens> = {}) {
    super(data);
  }
}

export { ElementLens as Lens };
