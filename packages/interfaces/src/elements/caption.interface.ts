import type { CaptionFormat } from '@genfeedai/enums';
import type { IBaseEntity, IIngredient } from '../index';

export interface ICaption extends IBaseEntity {
  ingredient: IIngredient | string;
  format: CaptionFormat;
  language: string;
  content?: string;
}

export interface ICaptionSegment {
  index: number;
  start: string;
  end: string;
  text: string;
}
