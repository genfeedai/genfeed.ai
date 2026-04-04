import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { ModelCategory } from '@genfeedai/enums';
import type { IElementMood } from '@genfeedai/interfaces';

export class ElementMood extends BaseEntity implements IElementMood {
  public declare key: string;
  public declare label: string;
  public declare description?: string;
  public declare category?: ModelCategory;

  constructor(data: Partial<IElementMood> = {}) {
    super(data);
  }
}

export { ElementMood as Mood };
