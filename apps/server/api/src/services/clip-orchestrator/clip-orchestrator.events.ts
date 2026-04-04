import type { ClipRunState } from '@api/services/clip-orchestrator/clip-run-state.enum';

/** Event names emitted by the clip orchestrator. */
export const CLIP_ORCHESTRATOR_EVENTS = {
  CONFIRMATION_REQUIRED: 'clip-orchestrator.confirmation-required',
  RUN_COMPLETED: 'clip-orchestrator.run-completed',
  RUN_FAILED: 'clip-orchestrator.run-failed',
  STATE_CHANGED: 'clip-orchestrator.state-changed',
  STEP_COMPLETED: 'clip-orchestrator.step-completed',
  STEP_FAILED: 'clip-orchestrator.step-failed',
  STEP_RETRYING: 'clip-orchestrator.step-retrying',
} as const;

/** Payload for state change events. */
export interface ClipRunStateChangeEvent {
  runId: string;
  projectId: string;
  previousState: ClipRunState;
  currentState: ClipRunState;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/** Payload for confirmation-required events. */
export interface ClipRunConfirmationEvent {
  runId: string;
  projectId: string;
  pendingState: ClipRunState;
  timestamp: Date;
}
