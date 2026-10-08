import type { Platform, PostFormat } from '../../enums';
import type {
  LearningGenerationContext,
  LearningGenerationReceipt,
} from '../analytics/content-learning.interface';
import type { BrandedGenerationReceiptV1 } from './branded-generation.interface';

export interface PostDraftGenerationInput {
  /**
   * Opt in to approved-brand generation with a saved receipt. Requires
   * `requestKey`; omitting it keeps the legacy draft behaviour unchanged.
   */
  brandMode?: 'approved_brand';
  /** Idempotency key for branded generation; a repeat returns the original. */
  requestKey?: string;
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
  /** Saved draft the branded receipt is bound to. Branded mode only. */
  postId?: string;
  brandedReceipt?: PostDraftBrandedReceiptSummary;
  learningReceipt?: LearningGenerationReceipt;
  description: string;
  /** Text model actually used — the resolved Admin default, or the seed fallback. */
  model?: string;
}
