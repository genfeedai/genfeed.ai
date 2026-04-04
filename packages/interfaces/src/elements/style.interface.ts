import type { ModelCategory } from '@genfeedai/enums';
import type { IBaseEntity, IElementBase } from '../index';

export interface IElementStyle extends IBaseEntity, IElementBase {
  category?: ModelCategory;
  models?: string[];
}
