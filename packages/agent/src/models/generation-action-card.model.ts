import type { GenerationHarnessReceipt } from '@genfeedai/contracts/interfaces/content/generation-harness.interface';

export type GenerationActionCardStatus =
  | 'idle'
  | 'generating'
  | 'done'
  | 'error'
  | 'declined'
  | 'pilot_review';

/** Where the generation card's flow is (#9736). Only an error has a message. */
export type GenerationCardPhase =
  | { status: 'idle' }
  | { status: 'generating' }
  | { status: 'pilot_review' }
  | { status: 'done' }
  | { status: 'error'; message: string }
  | { status: 'declined' };

/**
 * The last generation's output. It outlives the phase: a result used as input
 * or an accepted pilot stays on the canvas while the form is idle again.
 */
export interface GenerationCardResult {
  harness?: GenerationHarnessReceipt;
  id: string | null;
  url: string | null;
}

export interface GenerationCardState {
  phase: GenerationCardPhase;
  result: GenerationCardResult;
  /** A generation ran or was approved, so the card no longer offers Decline. */
  hasStarted: boolean;
  isDeclining: boolean;
  /** The next generation is the full-length run of an accepted video pilot. */
  isFullRun: boolean;
  /** The generation in flight is a short video pilot that needs review. */
  isPilotRun: boolean;
  isPilotCeilingReached: boolean;
  paidRejectedCount: number;
  pilotDurationSeconds: number | null;
  startedAt?: number;
}

export type GenerationCardEvent =
  | { type: 'generation_blocked'; message: string }
  | {
      type: 'generation_started';
      pilotDurationSeconds: number | null;
      startedAt: number;
    }
  | { type: 'result_received'; result: GenerationCardResult }
  | { type: 'generation_succeeded' }
  | { type: 'generation_failed'; message: string }
  | { type: 'generation_aborted' }
  | { type: 'run_pending' }
  | { type: 'retry' }
  | { type: 'pilot_accepted' }
  | { type: 'pilot_rejected' }
  | { type: 'result_used_as_input' }
  | { type: 'decline_started' }
  | { type: 'decline_finished'; isDeclined: boolean }
  | { type: 'decision_restored'; decision: 'approved' | 'declined' };
