import type { ModelCategory } from '../..';
import type { IBaseEntity, IPlatformElement } from '../index';

export interface IElementMood extends IBaseEntity, IPlatformElement {
  category?: ModelCategory;
}
