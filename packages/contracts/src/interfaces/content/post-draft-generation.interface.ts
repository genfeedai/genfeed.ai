import type { Platform, PostFormat } from '../../enums';

export interface PostDraftGenerationInput {
  brandId: string;
  prompt: string;
  platform: Platform;
  format?: PostFormat;
}

export interface PostDraftGenerationResult {
  description: string;
}
