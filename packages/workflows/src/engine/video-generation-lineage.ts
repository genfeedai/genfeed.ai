import type { ExecutionOptions } from '../contracts';

/**
 * Canonical video-generation node types the pilot-run gate wraps.
 * Processing nodes (lipSync, reframe, upscale) are out of scope.
 */
export const VIDEO_GENERATION_NODE_TYPES = [
  'videoGen',
  'generateVideo',
  'video-generator',
] as const;

export type VideoGenerationNodeType =
  (typeof VIDEO_GENERATION_NODE_TYPES)[number];

export type VideoGenerationAttemptKind = 'pilot' | 'full';

export type VideoGenerationAcceptanceSource = 'videoQa' | 'userReview';

export type VideoGenerationGatePhase =
  | 'bypass'
  | 'pilot'
  | 'awaitingAcceptance'
  | 'full'
  | 'halted';

/**
 * Narrow duck-type of the #3450 `VideoQaReport`. Do not import `VideoQaReport`
 * here — that type ships on a parallel branch and the two PRs merge independently.
 */
export type VideoQaAcceptanceReport = {
  passed: boolean;
  failures?: Array<{
    code: string;
    message: string;
    timestamp: number | null;
  }>;
};

export type VideoGenerationAcceptance = {
  source: VideoGenerationAcceptanceSource;
  passed: boolean;
  failures?: VideoQaAcceptanceReport['failures'];
};

export type VideoGenerationGateConfig = {
  isEnabled: boolean;
  /**
   * Requested duration at/above which a pilot is required (seconds).
   * Default 6 so the 4s provider minimum is below the gate.
   */
  durationThresholdSeconds: number;
  /**
   * Flat node credit cost at/above which a pilot is required when duration
   * cannot be shown to already be the provider minimum.
   */
  creditThreshold: number;
  /** Rejected paid candidates before halt. Default 3. */
  paidRetryCeiling: number;
  /**
   * When true, a gated step must complete a pilot before the full run.
   * When false, the host may skip the full run (offer-only).
   */
  isRequired: boolean;
  /** Provider minimum billable duration in seconds (Veo: 4). */
  minBillableDurationSeconds: number;
  /**
   * Duration the flat `videoGen` credit cost represents. Used to scale
   * pilot vs full charges. Default 8 matches `videoGen` node defaultData.
   */
  referenceDurationSeconds: number;
};

export const DEFAULT_VIDEO_GENERATION_GATE_CONFIG: VideoGenerationGateConfig = {
  creditThreshold: 10,
  durationThresholdSeconds: 6,
  isEnabled: true,
  isRequired: true,
  minBillableDurationSeconds: 4,
  paidRetryCeiling: 3,
  referenceDurationSeconds: 8,
};

export type VideoGenerationAttemptParameters = {
  model?: string;
  prompt?: string;
  seed?: number;
  durationSeconds: number;
  aspectRatio?: string;
  resolution?: string;
};

export type VideoGenerationLineageAttempt = {
  attemptNumber: number;
  attemptKind: VideoGenerationAttemptKind;
  durationSeconds: number;
  creditsCharged: number;
  accepted: boolean | null;
  rejectionReason?: string;
  parameters: VideoGenerationAttemptParameters;
};

export type VideoGenerationLineage = {
  lineageId: string;
  nodeId: string;
  workflowId: string;
  attempts: VideoGenerationLineageAttempt[];
  isAwaitingAcceptance: boolean;
};

export type VideoGenerationCreditMetadata = {
  lineageId: string;
  attemptKind: VideoGenerationAttemptKind;
  attemptNumber: number;
  accepted: boolean | null;
};

export type VideoGenerationFailureSummary = {
  lineageId: string;
  nodeId: string;
  paidCandidateCount: number;
  paidRetryCeiling: number;
  attempts: VideoGenerationLineageAttempt[];
  recurringFailure: string;
};

export type EvaluateVideoPilotFn = (
  output: unknown,
) => Promise<VideoGenerationAcceptance>;

export type EngineExecutionOptions = ExecutionOptions & {
  videoGenerationLineage?: VideoGenerationLineage;
  videoPilotAcceptance?: VideoGenerationAcceptance;
  evaluateVideoPilot?: EvaluateVideoPilotFn;
};
