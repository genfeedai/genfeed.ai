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

export const GENERATION_PROMPT_AUTHORS = [
  'agent',
  'agent_edited',
] as const satisfies readonly GenerationPromptAuthor[];

export interface GenerationHarnessReceipt {
  brandedGenerationReceiptId?: string;
  learningReceipt?: LearningGenerationReceipt;
  composedPrompt?: string;
  originalPrompt: string;
  enhancedPrompt: string;
  /** Exclusions the enhancer asked for; dispatched only to models with a native negative prompt. */
  negativePrompt?: string;
  /** The media brand brief the enhancer was given, verbatim; absent when the brief had nothing visual. */
  enhancerBrief?: string;
  /**
   * A receipt is either `applied` or `skipped`: enhancement off, an explicit
   * `raw` opt-out, or a failed enhancement that fell back to the prompt as
   * typed (`isEnhancementFailed`).
   */
  status: 'applied' | 'skipped';
  /** Enhancement was on but failed, so the prompt, and any skill or Knowledge pick, was not applied. */
  isEnhancementFailed?: boolean;
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
  /**
   * Brand references attached because the caller attached none. Absent when
   * the caller chose the references, branding was off, or the brand has none.
   */
  brandReferences?: GenerationBrandReferencesReceipt;
  /**
   * The approved palette measured on the final output once it completed.
   * Absent while the output is still being checked, for a raw generation, and
   * when the brand has no palette.
   */
  brandPalette?: GenerationBrandPaletteReceipt;
  /**
   * The spoken dialogue of an ad preset output checked against its script
   * (#7927). Absent unless the generation locked an audio reference and the
   * check was not turned off for the request.
   */
  adDialogue?: GenerationAdDialogueReceipt;
}

/**
 * Evidence, not a gate: a take that does not match the script is held for
 * review, never regenerated, and a check that could not run never fails the
 * generation.
 */
export type GenerationAdDialogueReceipt =
  | {
      status: 'pending';
      /** The script as submitted, kept so the take can be compared once it completes. */
      script: string;
    }
  | {
      status: 'matched' | 'needs_review';
      script: string;
      checkedAt: string;
      /** Share of script words the speech differs on, 0 to 1. */
      wordErrorRate: number;
      /** The most the take may differ before it is held for review. */
      maxWordErrorRate: number;
      expectedWordCount: number;
      /** Spoken words the script does not have. */
      added: string[];
      /** Script words that were not spoken. */
      removed: string[];
      /** Script words replaced by another spoken word. */
      changed: Array<{ expected: string; actual: string }>;
    }
  | {
      status: 'not_checked';
      script: string;
      /** Why the speech could not be compared, for example `transcription_unavailable`. */
      reasonCode: string;
    };

export interface GenerationBrandPaletteColor {
  id: string;
  hex: string;
  /** Where the brand uses the colour, in the brand's words. */
  usage?: string;
  isRequired: boolean;
  /** Share of the output's opaque pixels close to this colour, 0 to 1. */
  coverage: number;
  result: 'found' | 'absent';
}

/** A palette result is evidence on the receipt: a miss never stops a generation. */
export type GenerationBrandPaletteReceipt =
  | { status: 'measured'; colors: GenerationBrandPaletteColor[] }
  | {
      status: 'not_measured';
      /** Why the pixels could not be measured, for example `visual_composite_unproven`. */
      reasonCode: string;
    };

export interface GenerationBrandReferencesReceipt {
  attachedAssetIds: string[];
  /** The brand had references but the model accepts none. */
  skippedReason?: 'model_accepts_no_references';
}

/** Safe projection from persisted receipt JSON, including historical receipts. */
export function isGenerationEnhancementFailed(receipt: unknown): boolean {
  return (
    typeof receipt === 'object' &&
    receipt !== null &&
    'isEnhancementFailed' in receipt &&
    receipt.isEnhancementFailed === true
  );
}

/** Generation results retain this signal even when prompt details are withheld. */
export interface GenerationEnhancementStatus {
  isEnhancementFailed?: boolean;
}
