import type { IngredientFormat } from '@genfeedai/enums';

export interface IImageEditParams {
  model?: string;
  format?: IngredientFormat;
  width?: number;
  height?: number;
  prompt?: string;
  text?: string;
  enhanceModel?:
    | 'Standard V2'
    | 'Low Resolution V2'
    | 'CGI'
    | 'High Fidelity V2'
    | 'Text Refine';
  outputFormat?: 'jpg' | 'png' | 'webp';
  upscaleFactor?: '2x' | '4x' | '6x' | '8x';
  faceEnhancement?: boolean;
  faceEnhancementStrength?: number;
  faceEnhancementCreativity?: number;
  subjectDetection?: 'Foreground' | 'Background' | 'All';
  outputs?: number;
  style?: string;
}

export interface IImageEditResponse {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  url?: string;
  error?: string;
}

export interface IImageUpscaleRequest extends IImageEditParams {
  imageId: string;
}

export interface IImageReframeRequest {
  imageId: string;
  format?: IngredientFormat;
  width?: number;
  height?: number;
  prompt?: string;
}
