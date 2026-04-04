import type {
  IngredientFormat,
  VideoEaseCurve,
  VideoTransition,
} from '@genfeedai/enums';

export interface IVideoMergeParams {
  category: string;
  ids: string[];
  voice?: string;
  music?: string;
  isCaptionsEnabled?: boolean;
  transition?: VideoTransition;
  transitionDuration?: number;
  transitionEaseCurve?: VideoEaseCurve;
  zoomEaseCurve?: VideoEaseCurve;
  zoomConfigs?: Array<{
    startZoom?: number;
    endZoom?: number;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
  }>;
  isMuteVideoAudio?: boolean;
  musicVolume?: number;
}

export interface IVideoResizeParams {
  width: number;
  height: number;
}

export interface IVideoTextOverlayStyle {
  fontFamily?: string;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  padding?: string;
}

export interface IVideoTextOverlayParams {
  text: string;
  position?: string;
  fontSize?: string;
  style?: IVideoTextOverlayStyle;
}

export interface IVideoEditParams {
  model?: string;
  format?: IngredientFormat;
  width?: number;
  height?: number;
  text?: string;
  prompt?: string;
  mood?: string;
  style?: string;
  camera?: string;
  scene?: string;
  targetFps?: number;
  targetResolution?: string;
  metadata?: Record<string, unknown>;
}

export interface IVideoEditResponse {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  url?: string;
  error?: string;
}

export interface IVideoReframeRequest {
  videoId: string;
  format?: IngredientFormat;
  width?: number;
  height?: number;
  prompt?: string;
  mood?: string;
  style?: string;
  camera?: string;
  scene?: string;
}
