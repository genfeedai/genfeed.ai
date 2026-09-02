import type { ModelCategory } from '../..';
import type { IBaseEntity, IElementBase } from '../index';

export interface IElementBlacklist extends IBaseEntity, IElementBase {
  category?: ModelCategory;
  isActive: boolean;
  isDefault: boolean;
}
