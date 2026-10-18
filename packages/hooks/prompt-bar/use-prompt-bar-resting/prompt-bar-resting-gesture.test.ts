import { describe, expect, it } from 'vitest';
import {
  createPromptBarRestingGesture,
  recordPromptBarRestingScroll,
} from './prompt-bar-resting-gesture';

describe('recordPromptBarRestingScroll', () => {
  it('rests after a 24px gesture away from the end', () => {
    const gesture = createPromptBarRestingGesture(0);

    expect(
      recordPromptBarRestingScroll(gesture, {
        isAtEnd: false,
        now: 10,
        scrollTop: 12,
      }),
    ).toBe(false);
    expect(
      recordPromptBarRestingScroll(gesture, {
        isAtEnd: false,
        now: 20,
        scrollTop: 30,
      }),
    ).toBe(true);
  });

  it('counts scrolling back up as part of the gesture', () => {
    const gesture = createPromptBarRestingGesture(400);

    expect(
      recordPromptBarRestingScroll(gesture, {
        isAtEnd: false,
        now: 5,
        scrollTop: 370,
      }),
    ).toBe(true);
  });

  it('never rests at the end of the scroller', () => {
    const gesture = createPromptBarRestingGesture(0);

    expect(
      recordPromptBarRestingScroll(gesture, {
        isAtEnd: true,
        now: 5,
        scrollTop: 200,
      }),
    ).toBe(false);
  });

  it('starts a new gesture after a pause', () => {
    const gesture = createPromptBarRestingGesture(0);

    recordPromptBarRestingScroll(gesture, {
      isAtEnd: false,
      now: 10,
      scrollTop: 20,
    });
    expect(
      recordPromptBarRestingScroll(gesture, {
        isAtEnd: false,
        now: 500,
        scrollTop: 30,
      }),
    ).toBe(false);
  });
});
