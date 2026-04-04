import type { ModelCategory } from '@genfeedai/enums';
import type { IBaseEntity, IElementBase } from '../index';

export interface IElementMood extends IBaseEntity, IElementBase {
  category?: ModelCategory;
}
