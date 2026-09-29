import { describe, expect, it } from 'vitest';

import {
  shouldDelayThreadSwitchFetch,
  THREAD_SWITCH_DEBOUNCE_MS,
} from './plan-thread-switch-fetches';

describe('shouldDelayThreadSwitchFetch', () => {
  const debounceMs = THREAD_SWITCH_DEBOUNCE_MS;

  it('does not delay a switch after the debounce window', () => {
    expect(
      shouldDelayThreadSwitchFetch({
        debounceMs,
        lastSwitchAt: 1_000,
        lastThreadId: 'thread-a',
        now: 1_000 + debounceMs,
        threadId: 'thread-b',
      }),
    ).toBe(false);
  });
});
