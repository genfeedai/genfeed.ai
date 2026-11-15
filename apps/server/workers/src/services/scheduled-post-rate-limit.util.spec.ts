import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import {
  describeRateLimitPlan,
  planRateLimitedRetry,
  readRetryAfterMs,
} from '@workers/services/scheduled-post-rate-limit.util';
import { decideRetry } from '@workers/services/scheduled-post-retry-state.util';
import { describe, expect, it } from 'vitest';

const NOW = new Date('2026-11-15T10:00:00.000Z');
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function post(overrides: Record<string, unknown> = {}): PostEntity {
  return { id: 'post-1', retryCount: 0, ...overrides } as unknown as PostEntity;
}

describe('readRetryAfterMs', () => {
  it.each([
    ['an explicit retryAfterMs', { retryAfterMs: 5000 }, 5000],
    [
      'a Retry-After header in seconds',
      { response: { headers: { 'retry-after': '120' } } },
      120000,
    ],
    [
      'a Retry-After header as an HTTP date',
      {
        response: {
          headers: { 'retry-after': 'Sun, 15 Nov 2026 10:05:00 GMT' },
        },
      },
      5 * MINUTE,
    ],
    [
      'an x-rate-limit-reset header in epoch seconds',
      {
        response: {
          headers: { 'x-rate-limit-reset': String(NOW.getTime() / 1000 + 600) },
        },
      },
      10 * MINUTE,
    ],
    [
      'the SDK rateLimit.reset in epoch seconds',
      { rateLimit: { reset: NOW.getTime() / 1000 + 90 } },
      90000,
    ],
    [
      'a reset already in the past',
      { rateLimit: { reset: NOW.getTime() / 1000 - 90 } },
      0,
    ],
  ])('reads %s', (_label, error, expected) => {
    expect(readRetryAfterMs(error, NOW)).toBe(expected);
  });

  it.each([
    ['a plain string', '429 rate limit'],
    ['an error with no hints', new Error('429 rate limit')],
    [
      'an unparseable Retry-After',
      { response: { headers: { 'retry-after': 'soon' } } },
    ],
  ])('returns null for %s', (_label, error) => {
    expect(readRetryAfterMs(error, NOW)).toBeNull();
  });
});

describe('planRateLimitedRetry', () => {
  it('returns null for a failure that is not a rate limit', () => {
    expect(
      planRateLimitedRetry(post(), { error: '503 unavailable' }, NOW),
    ).toBeNull();
  });

  it('waits for the provider reset and dates lastAttemptAt one backoff before it', () => {
    const plan = planRateLimitedRetry(
      post(),
      {
        error: Object.assign(new Error('429 rate limit'), {
          rateLimit: { reset: NOW.getTime() / 1000 + 1800 },
        }),
      },
      NOW,
    );
    expect(plan).toEqual({
      firstLimitedAt: NOW,
      kind: 'wait',
      lastAttemptAt: new Date(NOW.getTime() + 29 * MINUTE),
      retryAt: new Date(NOW.getTime() + 30 * MINUTE),
    });
  });

  it('waits 15 minutes when the provider named no reset', () => {
    const plan = planRateLimitedRetry(post(), { error: '429 rate limit' }, NOW);
    expect(plan).toMatchObject({
      kind: 'wait',
      retryAt: new Date(NOW.getTime() + 15 * MINUTE),
    });
  });

  it('caps a single wait at 6 hours', () => {
    const plan = planRateLimitedRetry(
      post(),
      { error: '429 rate limit', retryAfterMs: 48 * HOUR },
      NOW,
    );
    expect(plan).toMatchObject({
      kind: 'wait',
      retryAt: new Date(NOW.getTime() + 6 * HOUR),
    });
  });

  it('keeps the time of the first limit across waits', () => {
    const firstLimitedAt = new Date(NOW.getTime() - 3 * HOUR);
    const plan = planRateLimitedRetry(
      post({
        targetError: {
          code: 'rate_limited',
          failedAt: firstLimitedAt.toISOString(),
        },
      }),
      { error: '429 rate limit' },
      NOW,
    );
    expect(plan).toMatchObject({ firstLimitedAt, kind: 'wait' });
  });

  it('starts the window over when the last error was not a rate limit', () => {
    const plan = planRateLimitedRetry(
      post({
        targetError: {
          code: 'network',
          failedAt: new Date(NOW.getTime() - 30 * HOUR).toISOString(),
        },
      }),
      { error: '429 rate limit' },
      NOW,
    );
    expect(plan).toMatchObject({ firstLimitedAt: NOW, kind: 'wait' });
  });

  it('gives up once the post has been limited for 24 hours', () => {
    const plan = planRateLimitedRetry(
      post({
        targetError: {
          code: 'rate_limited',
          failedAt: new Date(NOW.getTime() - 24 * HOUR).toISOString(),
        },
      }),
      { error: '429 rate limit' },
      NOW,
    );
    expect(plan).toEqual({ kind: 'give_up' });
  });
});

describe('describeRateLimitPlan', () => {
  it('leaves a failure that was not a rate limit unchanged', () => {
    expect(describeRateLimitPlan('boom', null)).toBe('boom');
  });

  it('says when the next attempt is', () => {
    expect(
      describeRateLimitPlan('429 rate limit', {
        firstLimitedAt: NOW,
        kind: 'wait',
        lastAttemptAt: NOW,
        retryAt: new Date('2026-11-15T10:30:00.000Z'),
      }),
    ).toBe('429 rate limit Next attempt at 2026-11-15T10:30:00.000Z.');
  });

  it('says why it gave up', () => {
    expect(describeRateLimitPlan('429 rate limit', { kind: 'give_up' })).toBe(
      'Still rate limited by the provider after 24 hours. 429 rate limit',
    );
  });
});

describe('decideRetry', () => {
  it('retries a rate limit even when the retry budget is spent', () => {
    const decision = decideRetry(
      post({ retryCount: 3 }),
      { error: '429 rate limit', message: '429 rate limit' },
      3,
    );
    expect(decision.canRetry).toBe(true);
    expect(decision.rateLimit?.kind).toBe('wait');
  });

  it('does not retry a rate limit that outlasted the give-up window', () => {
    const decision = decideRetry(
      post({
        targetError: {
          code: 'rate_limited',
          failedAt: new Date(Date.now() - 25 * HOUR).toISOString(),
        },
      }),
      { error: '429 rate limit', message: '429 rate limit' },
      3,
    );
    expect(decision.canRetry).toBe(false);
    expect(decision.errorMessage).toContain('Still rate limited');
  });

  it('stops retrying another retryable failure at the budget', () => {
    const failure = { error: '503 unavailable', message: '503 unavailable' };
    expect(decideRetry(post({ retryCount: 2 }), failure, 3).canRetry).toBe(
      true,
    );
    expect(decideRetry(post({ retryCount: 3 }), failure, 3).canRetry).toBe(
      false,
    );
  });
});
