import type { IngredientFormat, RouterPriority } from '../..';
import type { IIngredient } from '../index';
import type { KnowledgeSelection } from '../knowledge-base/knowledge-retrieval.interface';

export interface BaseGenerationPayload {
  requestedSkillSlugs?: string[];
  text: string;
  model?: string;
  autoSelectModel?: boolean;
  harness?: boolean;
  /** Explicit Knowledge pick; omit to let the brand's Knowledge apply automatically. */
  knowledge?: KnowledgeSelection;
  prioritize?: RouterPriority;
  brand?: string;
  references: string[];
  outputs: number;
  blacklist: string[];
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
  videoReferences?: string[];
}

export interface ImageGenerationPayload extends BaseGenerationPayload {
  format: IngredientFormat;
  quality?: string;
}

export interface MusicGenerationPayload {
  outputs: number;
  text: string;
  model?: string;
  autoSelectModel?: boolean;
  harness?: boolean;
  prioritize?: RouterPriority;
  duration?: number;
  instrumental?: boolean;
  lyrics?: string;
  label: string;
  folder?: string;
  /** Genre/style descriptors folded into the prompt server-side. */
  style?: string;
}

export interface AvatarGenerationPayload {
  voiceId?: string;
  avatarId?: string;
  photoUrl?: string;
  text: string;
  speech: string;
}

export interface GenerationResponse extends IIngredient {
  pendingIngredientIds?: string[];
}

export type SocketResult = string | { id?: string };
