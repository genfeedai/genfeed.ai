import type { Platform, PostFormat } from '../../enums';

export interface PostDraftGenerationInput {
  prompt: string;
  platform: Platform;
  format?: PostFormat;
}

export interface PostDraftGenerationResult {
  description: string;
}
