import type { ModelCategory } from '../..';
import type { IBaseEntity, IElementBase } from '../index';

export interface IElementMood extends IBaseEntity, IElementBase {
  category?: ModelCategory;
}
