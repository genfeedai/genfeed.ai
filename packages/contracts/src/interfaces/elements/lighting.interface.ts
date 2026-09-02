import type { ModelCategory } from '../..';
import type { IBaseEntity, IElementWithFlags } from '../index';

export interface IElementLighting extends IBaseEntity, IElementWithFlags {
  category?: ModelCategory;
}
