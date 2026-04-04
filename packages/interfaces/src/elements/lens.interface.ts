import type { ModelCategory } from '@genfeedai/enums';
import type { IBaseEntity, IElementWithFlags } from '../index';

export interface IElementLens extends IBaseEntity, IElementWithFlags {
  category?: ModelCategory;
}
