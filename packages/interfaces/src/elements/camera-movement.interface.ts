import type { ModelCategory } from '@genfeedai/enums';
import type { IBaseEntity, IElementWithFlags } from '../index';

export interface IElementCameraMovement extends IBaseEntity, IElementWithFlags {
  category?: ModelCategory;
}
