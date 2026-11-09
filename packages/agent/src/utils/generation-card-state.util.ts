import type {
  GenerationCardEvent,
  GenerationCardResult,
  GenerationCardState,
} from '@genfeedai/agent/models/generation-action-card.model';
import {
  hasReachedVideoPilotRetryCeiling,
  VIDEO_PILOT_PAID_RETRY_CEILING,
} from '@genfeedai/agent/utils/video-pilot-gate.util';

export const EMPTY_GENERATION_CARD_RESULT: GenerationCardResult = {
  harness: undefined,
  id: null,
  url: null,
};

export const VIDEO_PILOT_CEILING_MESSAGE = `Stopped after ${VIDEO_PILOT_PAID_RETRY_CEILING} rejected paid candidates. No further video generation will run for this clip.`;

/** A card restored from its persisted review decision (`action.data`). */
export function createGenerationCardState(
  decision: unknown,
): GenerationCardState {
  return {
    hasStarted: decision === 'approved',
    isDeclining: false,
    isFullRun: false,
    isPilotCeilingReached: false,
    isPilotRun: false,
    paidRejectedCount: 0,
    phase:
      decision === 'declined' ? { status: 'declined' } : { status: 'idle' },
    pilotDurationSeconds: null,
    result: EMPTY_GENERATION_CARD_RESULT,
    startedAt: undefined,
  };
}

/**
 * The generation card's transitions (#9736):
 *
 * - idle → generating; a video run longer than the provider minimum starts as
 *   a short pilot. A run the thread runtime accepted is generating until its
 *   settlement arrives, also after the card remounts.
 * - generating → done, or pilot_review for a pilot; → error on failure;
 *   → idle when stopped.
 * - pilot_review → idle with the full-length run armed (accept), or → idle
 *   with the result cleared (reject). The third rejected pilot stops the clip
 *   with an error and no retry.
 * - error → idle → generating on retry; done → idle when the result is used
 *   as input.
 * - idle → declined once a decline settles, or when the card reloads
 *   declined.
 */
export function generationCardReducer(
  state: GenerationCardState,
  event: GenerationCardEvent,
): GenerationCardState {
  switch (event.type) {
    case 'generation_blocked':
      return { ...state, phase: { message: event.message, status: 'error' } };
    case 'generation_started': {
      const isPilotRun =
        !state.isFullRun && event.pilotDurationSeconds !== null;
      return {
        ...state,
        hasStarted: true,
        isPilotRun,
        phase: { status: 'generating' },
        pilotDurationSeconds: isPilotRun
          ? event.pilotDurationSeconds
          : state.pilotDurationSeconds,
        result: EMPTY_GENERATION_CARD_RESULT,
        startedAt: event.startedAt,
      };
    }
    case 'result_received':
      return { ...state, result: event.result };
    case 'generation_succeeded':
      return {
        ...state,
        isFullRun: false,
        phase: { status: state.isPilotRun ? 'pilot_review' : 'done' },
      };
    case 'generation_failed':
      return { ...state, phase: { message: event.message, status: 'error' } };
    case 'generation_aborted':
      return { ...state, phase: { status: 'idle' } };
    case 'run_pending':
      return { ...state, hasStarted: true, phase: { status: 'generating' } };
    case 'retry':
      if (state.isPilotCeilingReached) {
        return state;
      }
      return {
        ...state,
        phase: { status: 'idle' },
        result: EMPTY_GENERATION_CARD_RESULT,
      };
    case 'pilot_accepted':
      if (
        state.phase.status !== 'pilot_review' ||
        state.isPilotCeilingReached
      ) {
        return state;
      }
      return { ...state, isFullRun: true, phase: { status: 'idle' } };
    case 'pilot_rejected': {
      if (state.phase.status !== 'pilot_review') {
        return state;
      }
      const paidRejectedCount = state.paidRejectedCount + 1;
      if (hasReachedVideoPilotRetryCeiling(paidRejectedCount)) {
        return {
          ...state,
          isFullRun: false,
          isPilotCeilingReached: true,
          paidRejectedCount,
          phase: { message: VIDEO_PILOT_CEILING_MESSAGE, status: 'error' },
        };
      }
      return {
        ...state,
        isFullRun: false,
        paidRejectedCount,
        phase: { status: 'idle' },
        result: EMPTY_GENERATION_CARD_RESULT,
      };
    }
    case 'result_used_as_input':
      return { ...state, phase: { status: 'idle' } };
    case 'decline_started':
      return { ...state, isDeclining: true };
    case 'decline_finished':
      return {
        ...state,
        isDeclining: false,
        phase: event.isDeclined ? { status: 'declined' } : state.phase,
      };
    case 'decision_restored':
      return event.decision === 'declined'
        ? { ...state, phase: { status: 'declined' } }
        : { ...state, hasStarted: true };
  }
}

/** The card's error copy; only the error phase has one. */
export function getGenerationCardError(
  state: GenerationCardState,
): string | null {
  return state.phase.status === 'error' ? state.phase.message : null;
}
