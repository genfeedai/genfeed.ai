import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ModelCategory } from '@genfeedai/enums';
import type { IElementBlacklist } from '@genfeedai/interfaces';

export class ElementBlacklist extends BaseEntity implements IElementBlacklist {
  public declare key: string;
  public declare label: string;
  public declare description?: string;
  public declare category?: ModelCategory;
  public declare isActive: boolean;
  public declare isDefault: boolean;

  constructor(data: Partial<IElementBlacklist> = {}) {
    super(data);
  }
}

export { ElementBlacklist as Blacklist };
