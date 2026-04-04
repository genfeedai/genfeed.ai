import type { IngredientFormat } from '@genfeedai/enums';
import type { ITag, IVideo } from '../index';

export interface ImageToVideoGenerationPayload extends Partial<IVideo> {
  text?: string;
  model?: string;
  references?: string[];
  outputs?: number;
  blacklist?: string[];
  tags?: ITag[];
  width?: number;
  height?: number;
  format?: IngredientFormat;
  fontFamily?: string;
  sounds?: string[];
  speech?: string;
  mood?: string;
  style?: string;
  camera?: string;
  resolution?: string;
  duration?: number;
  parent?: string;
  type: 'image-to-video';
}
