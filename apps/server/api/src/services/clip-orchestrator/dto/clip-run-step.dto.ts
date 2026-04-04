import type { ClipRunState } from '@api/services/clip-orchestrator/clip-run-state.enum';

/**
 * Represents one step in a clip run's lifecycle.
 */
export interface ClipRunStepDto {
  /** Unique step identifier. */
  stepId: string;

  /** The state this step represents. */
  state: ClipRunState;

  /** Timestamp when the step started. */
  startedAt: Date;

  /** Timestamp when the step completed (if finished). */
  completedAt?: Date;

  /** Number of retry attempts made for this step. */
  retryCount: number;

  /** Error message if the step failed. */
  error?: string;

  /** Output data produced by this step. */
  output?: Record<string, unknown>;
}
