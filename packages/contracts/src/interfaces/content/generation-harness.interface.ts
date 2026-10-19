import type { LearningGenerationReceipt } from '../analytics/content-learning.interface';
import type { KnowledgeReceipt } from '../knowledge-base/knowledge-retrieval.interface';

export interface GenerationHarnessSettings {
  organizationEnabled: boolean | null;
  brandEnabled: boolean | null;
  brandId?: string;
  isEnabled: boolean;
  source: 'default' | 'organization' | 'brand';
}

export interface UpdateGenerationHarnessSettings {
  scope: 'organization' | 'brand';
  brandId?: string;
  isEnabled: boolean | null;
}

/**
 * How a media generation treated the brand. `raw` means the prompt reached the
 * provider as typed and no brand identity was applied (explicit opt-out or
 * enhancement switched off); the two branded modes name the pinned revision.
 */
export type GenerationBrandMode =
  | 'approved_brand'
  | 'provisional_brand'
  | 'raw';

/**
 * Who wrote the prompt a generation started from (#7341), so the harness
 * A/B (#4927) can compare agent and human prompts: `agent` is an agent
 * proposal sent unchanged, `agent_edited` one the member changed first.
 * Absent means the member wrote the prompt.
 */
export type GenerationPromptAuthor = 'agent' | 'agent_edited';

export const GENERATION_PROMPT_AUTHORS: readonly GenerationPromptAuthor[] = [
  'agent',
  'agent_edited',
];

export interface GenerationHarnessReceipt {
  brandedGenerationReceiptId?: string;
  learningReceipt?: LearningGenerationReceipt;
  composedPrompt?: string;
  originalPrompt: string;
  enhancedPrompt: string;
  /** Exclusions the enhancer asked for; dispatched only to models with a native negative prompt. */
  negativePrompt?: string;
  /**
   * Enhancement never degrades silently: when brand enhancement fails the
   * request stops before any paid call, so a receipt is either `applied` or
   * `skipped` (enhancement off, or an explicit `raw` opt-out).
   */
  status: 'applied' | 'skipped';
  /** Absent on receipts written before brand modes existed. */
  brandMode?: GenerationBrandMode;
  /** Absent when the member wrote the prompt. */
  promptAuthor?: GenerationPromptAuthor;
  /** The brand revision the enhancement was pinned to; never set in `raw` mode. */
  brandRevisionId?: string;
  brandRevisionVersion?: number;
  source: 'default' | 'organization' | 'brand' | 'request';
  brandId: string;
  appliedPacks: Array<{ id: string; version: string }>;
  /** Exact Knowledge source versions folded into the enhanced prompt. */
  knowledgeReceipts?: KnowledgeReceipt[];
}
