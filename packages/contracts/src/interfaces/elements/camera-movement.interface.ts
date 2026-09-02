import type { ModelCategory } from '../..';
import type { IBaseEntity, IElementWithFlags } from '../index';

export interface IElementCameraMovement extends IBaseEntity, IElementWithFlags {
  category?: ModelCategory;
}
