import type { ModelCategory } from '../..';
import type { IBaseEntity, IElementWithFlags } from '../index';

export interface IElementLens extends IBaseEntity, IElementWithFlags {
  category?: ModelCategory;
}
