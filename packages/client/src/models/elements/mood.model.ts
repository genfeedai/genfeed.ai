import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ModelCategory } from '@genfeedai/contracts';
import type { IElementMood } from '@genfeedai/contracts/interfaces';

export class ElementMood extends BaseEntity implements IElementMood {
  declare public key: string;
  declare public label: string;
  declare public description?: string;
  declare public category?: ModelCategory;
  declare public isActive?: boolean;
  declare public isPlatformDefault?: boolean;
  declare public sortOrder?: number;

  constructor(data: Partial<IElementMood> = {}) {
    super(data);
  }
}

export { ElementMood as Mood };
