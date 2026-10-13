import type { Platform, PostFormat } from '../../enums';
import type {
  LearningGenerationContext,
  LearningGenerationReceipt,
} from '../analytics/content-learning.interface';
import type { BrandedGenerationReceiptV1 } from './branded-generation.interface';

export interface PostDraftGenerationInput {
  /** Idempotency key (UUID v4); a repeat returns the original draft. */
  requestKey: string;
  learningContext?: LearningGenerationContext;
  brandId: string;
  prompt: string;
  platform: Platform;
  format?: PostFormat;
}

export interface PostDraftBrandedReceiptSummary {
  id: string;
  revision: number;
  state: BrandedGenerationReceiptV1['state'];
  compliance: BrandedGenerationReceiptV1['compliance'];
  /** True when this response replays an earlier request without a new dispatch. */
  isReplayed: boolean;
}

export interface PostDraftGenerationResult {
  /** Saved draft the receipt is bound to. */
  postId: string;
  brandedReceipt: PostDraftBrandedReceiptSummary;
  learningReceipt?: LearningGenerationReceipt;
  description: string;
  /** Text model actually used — the resolved Admin default, or the seed fallback. */
  model?: string;
}
