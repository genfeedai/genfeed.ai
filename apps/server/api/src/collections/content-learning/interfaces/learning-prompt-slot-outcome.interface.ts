import type { SlotComparisonReport } from '@genfeedai/harness';

/** Most organizations one pooled report may read. */
export const LEARNING_PROMPT_SLOT_POOL_LIMIT = 20;

export interface LearningPromptSlotOutcomeQuery {
  /** One organization, or several for a pooled internal view. */
  organizationIds: string[];
  brandId?: string;
  credentialId?: string;
}

/** The posts of one media type measured against one objective. */
export interface LearningPromptSlotOutcomeGroup {
  /** Ingredient category of the media the prompt produced, e.g. `IMAGE`. */
  category: string;
  /** The objective the reward was scored against, e.g. `engagement`. */
  objective: string;
  /** Posts that contributed a measured reward and a stored prompt. */
  postCount: number;
  comparison: SlotComparisonReport;
}

export interface LearningPromptSlotOutcomeReport {
  organizationIds: string[];
  /**
   * True when more than one organization was read together. Their audiences
   * differ, so a gap can reflect who saw the posts rather than the slot;
   * treat a pooled verdict as a weaker lead than a single-organization one.
   */
  isPooled: boolean;
  /** Posts read: published media posts with a learning decision. */
  postCount: number;
  /** Posts left out, by reason. */
  skipped: {
    /** The latest reward is missing, not valid, or has no composite. */
    noValidReward: number;
    /** No media ingredient with a stored prompt. */
    noPrompt: number;
    /** The prompt predates structured slots, so it has nothing to compare. */
    noSlots: number;
  };
  /** True when the post limit was reached, so older posts were not read. */
  isTruncated: boolean;
  groups: LearningPromptSlotOutcomeGroup[];
}
