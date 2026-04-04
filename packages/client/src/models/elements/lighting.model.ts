import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ModelCategory } from '@genfeedai/enums';
import type { IElementLighting } from '@genfeedai/interfaces';

export class ElementLighting extends BaseEntity implements IElementLighting {
  public declare key: string;
  public declare label: string;
  public declare description?: string;
  public declare category?: ModelCategory;
  public declare isActive?: boolean;
  public declare isDefault?: boolean;

  constructor(data: Partial<IElementLighting> = {}) {
    super(data);
  }
}

export { ElementLighting as Lighting };
