import type { ModelCategory } from '@genfeedai/enums';
import type { IBaseEntity, IElementBase } from '../index';

export interface IFontFamily extends IBaseEntity, IElementBase {
  category?: ModelCategory;
}
