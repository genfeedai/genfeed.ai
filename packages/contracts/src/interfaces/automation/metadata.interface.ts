import type { IBaseEntity, IPrompt, ITag } from '../index';
import type { ImageEditingRecipe } from '../studio/image-editing.interface';

export interface IMetadata extends IBaseEntity {
  imageEdit?: ImageEditingRecipe;
  prompt?: IPrompt;
  label: string;
  description?: string;
  model?: string;
  modelLabel?: string;
  result?: string;
  extension?: string;
  language?: string;
  duration?: number;
  width?: number;
  height?: number;
  size?: number;
  style?: string;
  hasAudio?: boolean;
  shortId?: string;
  tags?: ITag[];
  url?: string;
}
