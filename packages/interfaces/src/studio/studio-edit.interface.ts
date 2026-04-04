import type { IngredientCategory, IngredientFormat } from '@genfeedai/enums';
import type { IImageEditParams } from '../components/image-edit.interface';
import type { IEditFormData, IIngredient } from '../index';

export interface EditReframePayload extends IImageEditParams {
  text: string;
  model: string;
  format: IngredientFormat;
  width?: number;
  height?: number;
  category: IngredientCategory;
  brand?: string;
}

interface UpscalePayloadBase {
  prompt: string;
  model: string;
  category: IngredientCategory;
  parent: string;
  brand?: string;
}

export interface VideoUpscalePayload extends UpscalePayloadBase {
  targetFps: NonNullable<IEditFormData['fps']>;
  targetResolution: NonNullable<IEditFormData['resolution']>;
}

export interface ImageUpscalePayload extends UpscalePayloadBase {
  format?: IngredientFormat;
  width?: number;
  height?: number;
  enhanceModel: NonNullable<IEditFormData['enhanceModel']>;
  outputFormat: NonNullable<IEditFormData['outputFormat']>;
  upscaleFactor: '2x' | '4x' | '6x' | '8x';
  subjectDetection: 'Foreground' | 'Background' | 'All';
  faceEnhancement: boolean;
  faceEnhancementStrength?: number;
  faceEnhancementCreativity?: number;
}

export interface EditPayload extends Partial<IIngredient> {
  prompt: string;
  model: string;
  category: IngredientCategory;
  parent: string;
  mask?: string;
  mode?: 'inpaint';
  brand?: string;
  outputFormat?: 'jpg' | 'png';
}

export type MediaResult = string | { id?: string };
