import { describe, expect, it } from 'vitest';

import {
  planThreadSwitchFetches,
  shouldDelayThreadSwitchFetch,
  THREAD_SWITCH_DEBOUNCE_MS,
} from './plan-thread-switch-fetches';

describe('planThreadSwitchFetches', () => {
  it('skips thread metadata and snapshot on a fresh cache, but still revalidates messages', () => {
    expect(
      planThreadSwitchFetches({
        hasInFlightHydration: false,
        isCacheFresh: true,
      }),
    ).toEqual({
      shouldFetchMessages: true,
      shouldFetchSnapshot: false,
      shouldFetchThread: false,
    });
  });

  it('fires the full cold set when the cache is stale', () => {
    expect(
      planThreadSwitchFetches({
        hasInFlightHydration: false,
        isCacheFresh: false,
      }),
    ).toEqual({
      shouldFetchMessages: true,
      shouldFetchSnapshot: true,
      shouldFetchThread: true,
    });
  });

  it('does not stack a second messages/snapshot set when hydration is already in flight', () => {
    expect(
      planThreadSwitchFetches({
        hasInFlightHydration: true,
        isCacheFresh: false,
      }),
    ).toEqual({
      shouldFetchMessages: false,
      shouldFetchSnapshot: false,
      shouldFetchThread: true,
    });
  });

  it('skips every request when a fresh cache is already being hydrated', () => {
    expect(
      planThreadSwitchFetches({
        hasInFlightHydration: true,
        isCacheFresh: true,
      }),
    ).toEqual({
      shouldFetchMessages: false,
      shouldFetchSnapshot: false,
      shouldFetchThread: false,
    });
  });
});

describe('shouldDelayThreadSwitchFetch', () => {
  const debounceMs = THREAD_SWITCH_DEBOUNCE_MS;

  it('does not delay the first switch in a session', () => {
    expect(
      shouldDelayThreadSwitchFetch({
        debounceMs,
        lastSwitchAt: null,
        lastThreadId: null,
        now: 1_000,
        threadId: 'thread-a',
      }),
    ).toBe(false);
  });

  it('does not delay a remount of the same thread', () => {
    expect(
      shouldDelayThreadSwitchFetch({
        debounceMs,
        lastSwitchAt: 1_000,
        lastThreadId: 'thread-a',
        now: 1_010,
        threadId: 'thread-a',
      }),
    ).toBe(false);
  });

  it('delays a rapid bounce onto a different thread', () => {
    expect(
      shouldDelayThreadSwitchFetch({
        debounceMs,
        lastSwitchAt: 1_000,
        lastThreadId: 'thread-a',
        now: 1_000 + debounceMs - 1,
        threadId: 'thread-b',
      }),
    ).toBe(true);
  });

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
