import type { ModelCategory } from '../..';
import type { IBaseEntity, IPlatformElement } from '../index';

export interface IElementBlacklist extends IBaseEntity, IPlatformElement {
  category?: ModelCategory;
  isActive: boolean;
  isDefault: boolean;
}
