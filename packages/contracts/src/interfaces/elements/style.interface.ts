import type { ModelCategory } from '../..';
import type { IBaseEntity, IPlatformElement } from '../index';

export interface IElementStyle extends IBaseEntity, IPlatformElement {
  category?: ModelCategory;
  models?: string[];
}
