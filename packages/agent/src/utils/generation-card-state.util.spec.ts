import type {
  GenerationCardEvent,
  GenerationCardState,
} from '@genfeedai/agent/models/generation-action-card.model';
import { describe, expect, it } from 'vitest';
import {
  createGenerationCardState,
  EMPTY_GENERATION_CARD_RESULT,
  generationCardReducer,
  getGenerationCardError,
  VIDEO_PILOT_CEILING_MESSAGE,
} from './generation-card-state.util';

const IDLE = createGenerationCardState(undefined);
const RESULT = { id: 'ing-1', url: 'https://cdn.test/1.png' };
const GENERATING: GenerationCardState = {
  ...IDLE,
  hasStarted: true,
  phase: { status: 'generating' },
  startedAt: 1000,
};
const PILOT_GENERATING: GenerationCardState = {
  ...GENERATING,
  isPilotRun: true,
  pilotDurationSeconds: 5,
};
const PILOT_REVIEW: GenerationCardState = {
  ...PILOT_GENERATING,
  phase: { status: 'pilot_review' },
  result: RESULT,
};
const DONE: GenerationCardState = {
  ...GENERATING,
  phase: { status: 'done' },
  result: RESULT,
};
const FAILED: GenerationCardState = {
  ...GENERATING,
  phase: { message: 'Provider down', status: 'error' },
};

describe('createGenerationCardState', () => {
  it.each([
    [undefined, { status: 'idle' }, false],
    ['approved', { status: 'idle' }, true],
    ['declined', { status: 'declined' }, false],
  ])('restores the %s decision', (decision, phase, hasStarted) => {
    const state = createGenerationCardState(decision);

    expect(state.phase).toEqual(phase);
    expect(state.hasStarted).toBe(hasStarted);
  });
});

describe('generationCardReducer', () => {
  it.each<
    [string, GenerationCardState, GenerationCardEvent, GenerationCardState]
  >([
    [
      'starting a run clears the last result and error',
      { ...FAILED, result: RESULT },
      {
        pilotDurationSeconds: null,
        startedAt: 2000,
        type: 'generation_started',
      },
      { ...GENERATING, startedAt: 2000 },
    ],
    [
      'starting a long video run makes it a pilot',
      IDLE,
      { pilotDurationSeconds: 5, startedAt: 1000, type: 'generation_started' },
      PILOT_GENERATING,
    ],
    [
      'starting an accepted full-length run is not a pilot',
      { ...PILOT_REVIEW, isFullRun: true, phase: { status: 'idle' } },
      { pilotDurationSeconds: 5, startedAt: 3000, type: 'generation_started' },
      {
        ...PILOT_GENERATING,
        isFullRun: true,
        isPilotRun: false,
        result: EMPTY_GENERATION_CARD_RESULT,
        startedAt: 3000,
      },
    ],
    [
      'a finished run is done',
      { ...GENERATING, result: RESULT },
      { type: 'generation_succeeded' },
      DONE,
    ],
    [
      'a finished pilot waits for review',
      { ...PILOT_GENERATING, result: RESULT },
      { type: 'generation_succeeded' },
      PILOT_REVIEW,
    ],
    [
      'a finished full-length run disarms the full run',
      { ...GENERATING, isFullRun: true, result: RESULT },
      { type: 'generation_succeeded' },
      DONE,
    ],
    [
      'a failed run shows its error',
      GENERATING,
      { message: 'Provider down', type: 'generation_failed' },
      FAILED,
    ],
    [
      'a blocked run shows why without starting',
      IDLE,
      { message: 'Start Frame is required.', type: 'generation_blocked' },
      {
        ...IDLE,
        phase: { message: 'Start Frame is required.', status: 'error' },
      },
    ],
    [
      'a stopped run returns to idle',
      GENERATING,
      { type: 'generation_aborted' },
      { ...GENERATING, phase: { status: 'idle' } },
    ],
    [
      'a run accepted by the thread runtime is generating',
      IDLE,
      { type: 'run_pending' },
      { ...IDLE, hasStarted: true, phase: { status: 'generating' } },
    ],
    [
      'retry clears the error and the result',
      { ...FAILED, result: RESULT },
      { type: 'retry' },
      { ...FAILED, phase: { status: 'idle' } },
    ],
    [
      'accepting a pilot arms the full-length run',
      PILOT_REVIEW,
      { type: 'pilot_accepted' },
      { ...PILOT_REVIEW, isFullRun: true, phase: { status: 'idle' } },
    ],
    [
      'accepting outside pilot review does nothing',
      DONE,
      { type: 'pilot_accepted' },
      DONE,
    ],
    [
      'rejecting a pilot counts it and clears the result',
      PILOT_REVIEW,
      { type: 'pilot_rejected' },
      {
        ...PILOT_REVIEW,
        paidRejectedCount: 1,
        phase: { status: 'idle' },
        result: EMPTY_GENERATION_CARD_RESULT,
      },
    ],
    [
      'the third rejected pilot stops the clip',
      { ...PILOT_REVIEW, paidRejectedCount: 2 },
      { type: 'pilot_rejected' },
      {
        ...PILOT_REVIEW,
        isPilotCeilingReached: true,
        paidRejectedCount: 3,
        phase: { message: VIDEO_PILOT_CEILING_MESSAGE, status: 'error' },
      },
    ],
    [
      'a result used as input keeps the result on an idle form',
      DONE,
      { type: 'result_used_as_input' },
      { ...DONE, phase: { status: 'idle' } },
    ],
    [
      'a settled decline ends the review',
      { ...IDLE, isDeclining: true },
      { isDeclined: true, type: 'decline_finished' },
      { ...IDLE, phase: { status: 'declined' } },
    ],
    [
      'a failed or pending decline leaves the card idle',
      { ...IDLE, isDeclining: true },
      { isDeclined: false, type: 'decline_finished' },
      IDLE,
    ],
  ])('%s', (_name, state, event, expected) => {
    expect(generationCardReducer(state, event)).toEqual(expected);
  });

  it('ignores retry once the pilot ceiling is reached', () => {
    const stopped: GenerationCardState = {
      ...PILOT_REVIEW,
      isPilotCeilingReached: true,
      phase: { message: VIDEO_PILOT_CEILING_MESSAGE, status: 'error' },
    };

    expect(generationCardReducer(stopped, { type: 'retry' })).toBe(stopped);
  });
});

describe('getGenerationCardError', () => {
  it.each<[GenerationCardState, string | null]>([
    [FAILED, 'Provider down'],
    [DONE, null],
    [IDLE, null],
  ])('reads the error of %o as %s', (state, expected) => {
    expect(getGenerationCardError(state)).toBe(expected);
  });
});
