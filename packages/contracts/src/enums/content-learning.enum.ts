export enum ContentLearningMode {
  SHADOW = 'shadow',
  LIVE = 'live',
  PAUSED = 'paused',
  DISABLED = 'disabled',
  BLOCKED = 'blocked',
}
export enum ContentLearningArm {
  BASELINE = 'baseline-v1',
  QUESTION_EXAMPLE = 'question-example-v1',
  PROOF_STEPS = 'proof-steps-v1',
}
export enum ContentLearningReleaseStage {
  CANDIDATE = 'candidate',
  CANARY = 'canary',
  LIMITED = 'limited',
  STABLE = 'stable',
  PAUSED = 'paused',
  RETIRED = 'retired',
  INVALID = 'invalid',
}
export enum ContentLearningOperationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  INVALIDATED = 'invalidated',
}
export enum ContentLearningRunStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  INSUFFICIENT_DATA = 'insufficient_data',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  INVALIDATED = 'invalidated',
}
/** Run and operation statuses that still hold a dispatch slot (non-terminal). */
export const CONTENT_LEARNING_ACTIVE_STATUSES: readonly string[] = [
  ContentLearningRunStatus.PENDING,
  ContentLearningRunStatus.RUNNING,
];
