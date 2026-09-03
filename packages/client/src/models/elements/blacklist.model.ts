import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ModelCategory } from '@genfeedai/contracts';
import type { IElementBlacklist } from '@genfeedai/contracts/interfaces';

export class ElementBlacklist extends BaseEntity implements IElementBlacklist {
  declare public key: string;
  declare public label: string;
  declare public description?: string;
  declare public category?: ModelCategory;
  declare public isActive: boolean;
  declare public isDefault: boolean;

  constructor(data: Partial<IElementBlacklist> = {}) {
    super(data);
  }
}

export { ElementBlacklist as Blacklist };
