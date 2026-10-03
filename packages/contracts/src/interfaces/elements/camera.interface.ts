import type { ModelCategory } from '../..';
import type { IBaseEntity, IPlatformElement } from '../index';

export interface IElementCamera extends IBaseEntity, IPlatformElement {
  category?: ModelCategory;
}
