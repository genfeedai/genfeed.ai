import type { IngredientFormat, RouterPriority } from '@genfeedai/enums';
import type { IIngredient } from '../index';

export interface BaseGenerationPayload {
  text: string;
  model?: string;
  autoSelectModel?: boolean;
  prioritize?: RouterPriority;
  brand?: string;
  references: string[];
  outputs: number;
  blacklist: string;
  tags: string[];
  width: number;
  height: number;
  camera?: string;
  style?: string;
  scene?: string;
  lighting?: string;
  mood?: string;
  isBrandingEnabled: boolean;
  brandingMode?: 'off' | 'brand';
  promptTemplate?: string;
  useTemplate?: boolean;
  folder?: string;
}

export interface VideoGenerationPayload extends BaseGenerationPayload {
  format: IngredientFormat;
  fontFamily?: string;
  sounds: string[];
  speech?: string;
  lens?: string;
  cameraMovement?: string;
  isAudioEnabled: boolean;
  resolution?: string;
  duration?: number;
  endFrame?: string;
}

export interface ImageGenerationPayload extends BaseGenerationPayload {
  format: IngredientFormat;
}

export interface MusicGenerationPayload {
  outputs: number;
  text: string;
  model?: string;
  autoSelectModel?: boolean;
  prioritize?: RouterPriority;
  duration: number;
  label: string;
  folder?: string;
}

export interface AvatarGenerationPayload {
  voiceId?: string;
  avatarId?: string;
  text: string;
  speech: string;
}

export interface GenerationResponse extends IIngredient {
  pendingIngredientIds?: string[];
}

export type SocketResult = string | { id?: string };
