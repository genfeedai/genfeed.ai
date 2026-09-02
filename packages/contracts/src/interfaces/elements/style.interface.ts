import type { ModelCategory } from '../..';
import type { IBaseEntity, IElementBase } from '../index';

export interface IElementStyle extends IBaseEntity, IElementBase {
  category?: ModelCategory;
  models?: string[];
}
