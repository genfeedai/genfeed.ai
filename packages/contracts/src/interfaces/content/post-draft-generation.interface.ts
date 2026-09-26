import type { Platform, PostFormat } from '../../enums';

export interface PostDraftGenerationInput {
  brandId: string;
  prompt: string;
  platform: Platform;
  format?: PostFormat;
}

export interface PostDraftGenerationResult {
  description: string;
  /** Text model actually used — the resolved Admin default, or the seed fallback. */
  model?: string;
}
