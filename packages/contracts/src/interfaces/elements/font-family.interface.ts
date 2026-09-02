import type { ModelCategory } from '../..';
import type { IBaseEntity, IElementBase } from '../index';

export interface IFontFamily extends IBaseEntity, IElementBase {
  category?: ModelCategory;
}
