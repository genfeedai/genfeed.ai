import type { Platform, PostFormat } from '../../enums';
import type {
  LearningGenerationContext,
  LearningGenerationReceipt,
} from '../analytics/content-learning.interface';

export interface PostDraftGenerationInput {
  learningContext?: LearningGenerationContext;
  brandId: string;
  prompt: string;
  platform: Platform;
  format?: PostFormat;
}

export interface PostDraftGenerationResult {
  learningReceipt?: LearningGenerationReceipt;
  description: string;
  /** Text model actually used — the resolved Admin default, or the seed fallback. */
  model?: string;
}
