export type LearningSlotVerdict =
  | 'better'
  | 'worse'
  | 'within_noise'
  | 'insufficient_data';

export interface LearningSlotGroup {
  count: number;
  mean: number | null;
}

/** One slot (or slot value) compared against the rest of the same slot. */
export interface LearningSlotComparison {
  slot: string;
  /** Lower-cased value compared; null compares filled against empty. */
  value: string | null;
  filled: LearningSlotGroup;
  rest: LearningSlotGroup;
  difference: number | null;
  lower: number | null;
  upper: number | null;
  verdict: LearningSlotVerdict;
}

export interface LearningSlotComparisonReport {
  observationCount: number;
  excludedCount: number;
  comparisonCount: number;
  alpha: number;
  comparisons: LearningSlotComparison[];
}

/** The posts of one media type measured against one objective. */
export interface LearningPromptSlotOutcomeGroup {
  /** Ingredient category of the media the prompt produced, e.g. `IMAGE`. */
  category: string;
  /** The objective the reward was scored against, e.g. `engagement`. */
  objective: string;
  /** Posts that contributed a measured reward and a stored prompt. */
  postCount: number;
  comparison: LearningSlotComparisonReport;
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
