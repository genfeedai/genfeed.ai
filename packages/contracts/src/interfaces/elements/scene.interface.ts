import type { ModelCategory } from '../..';
import type { IBaseEntity, IPlatformElement } from '../index';

export interface IElementScene extends IBaseEntity, IPlatformElement {
  category?: ModelCategory;
  isFavorite?: boolean;
}
