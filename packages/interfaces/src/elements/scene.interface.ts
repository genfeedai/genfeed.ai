import type { ModelCategory } from '@genfeedai/enums';
import type { IBaseEntity, IElementBase } from '../index';

export interface IElementScene extends IBaseEntity, IElementBase {
  category?: ModelCategory;
  isFavorite?: boolean;
}
