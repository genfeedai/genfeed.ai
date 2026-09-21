/**
 * Expert Path positioning scorecard — the server-side port of the public
 * `expert-validator` skill. Scores live on the brand's harness profile.
 */
export type ExpertPositioningDimensionKey =
  | 'attractiveCharacter'
  | 'originStory'
  | 'bigDomino'
  | 'newOpportunity'
  | 'authoritySignals'
  | 'differentiation';

export type ExpertPositioningRating =
  | 'expert_positioned'
  | 'good_foundation'
  | 'needs_work'
  | 'commodity_zone'
  | 'invisible';

export interface IExpertPositioningDimensionScore {
  key: ExpertPositioningDimensionKey;
  label: string;
  /** Rubric weight (2, 1.5 or 1). */
  weight: number;
  /** Raw rubric score, 0-10. */
  score: number;
  /** `score × weight`. */
  weightedScore: number;
  /** `10 × weight`. */
  maxWeightedScore: number;
  /** Interview field that most improves this dimension when answered. */
  followUpFieldKey: string;
  followUpQuestion: string;
}

export interface IExpertPositioningScore {
  version: 1;
  dimensions: IExpertPositioningDimensionScore[];
  /** Weighted total normalized to 0-100. */
  totalScore: number;
  rating: ExpertPositioningRating;
  weakestDimension: ExpertPositioningDimensionKey;
  /** ISO timestamp. */
  scoredAt: string;
}

export type ExpertFirstSystemStatus = 'none' | 'generated' | 'failed';

export type ExpertFirstSystemItemAction = 'approve' | 'edit' | 'reject';

/** Preconditions and cost shown before the first content system runs. */
export interface IExpertFirstSystemReadiness {
  isReady: boolean;
  creditCost: number;
  /** Connected platforms, or the interview platforms when none are connected. */
  platforms: string[];
  isUsingInterviewPlatforms: boolean;
  missing: ('positioning' | 'corpus')[];
}

/**
 * Aggregated Expert Path state for a brand. Drives the onboarding steps, the
 * skipped-step workspace tasks, and the weekly digest's "Record next" prompt.
 */
export interface IExpertPathStatus {
  brandId: string;
  isExpert: boolean;
  positioning: {
    answeredCount: number;
    totalCount: number;
    isComplete: boolean;
    harnessProfileId?: string;
    score?: IExpertPositioningScore;
  };
  corpus: {
    sourceCount: number;
    readySourceCount: number;
    isComplete: boolean;
  };
  firstSystem: {
    status: ExpertFirstSystemStatus;
    planId?: string;
    error?: string;
    readiness: IExpertFirstSystemReadiness;
  };
  publishApproval: {
    isRequired: boolean;
  };
}
