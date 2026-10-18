import type {
  PromptBarRestingGestureState,
  PromptBarRestingScrollSample,
} from '@genfeedai/props/prompt-bars/prompt-bar-resting.props';

/** A scroll gesture this long folds the bar into its one-line resting pill. */
export const PROMPT_BAR_REST_THRESHOLD_PX = 24;
/** A pause this long between scroll events starts a new gesture. */
export const PROMPT_BAR_REST_GESTURE_RESET_MS = 120;
/** Within this distance of the scroller's end the bar opens back up. */
export const PROMPT_BAR_REST_END_THRESHOLD_PX = 40;

export function createPromptBarRestingGesture(
  scrollTop: number,
): PromptBarRestingGestureState {
  return { accumulatedPx: 0, lastEventAt: 0, lastScrollTop: scrollTop };
}

export function isScrollerAtEnd(element: HTMLElement): boolean {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    PROMPT_BAR_REST_END_THRESHOLD_PX
  );
}

/**
 * Records one scroll event and says whether the bar should rest. Reaching the
 * end never rests the bar; everywhere else a 24px gesture does, in either
 * direction, so the gallery or transcript gets the room back while browsing.
 */
export function recordPromptBarRestingScroll(
  state: PromptBarRestingGestureState,
  sample: PromptBarRestingScrollSample,
): boolean {
  const delta = Math.abs(sample.scrollTop - state.lastScrollTop);
  const isNewGesture =
    sample.now - state.lastEventAt > PROMPT_BAR_REST_GESTURE_RESET_MS;

  state.lastScrollTop = sample.scrollTop;
  state.lastEventAt = sample.now;

  if (sample.isAtEnd) {
    state.accumulatedPx = 0;
    return false;
  }

  state.accumulatedPx = (isNewGesture ? 0 : state.accumulatedPx) + delta;
  if (state.accumulatedPx < PROMPT_BAR_REST_THRESHOLD_PX) {
    return false;
  }

  state.accumulatedPx = 0;
  return true;
}
