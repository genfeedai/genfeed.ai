import type { PostingWindowResult } from '@genfeedai/contracts/interfaces';
import { DEFAULT_POSTING_WINDOW_OPTIONS } from '@genfeedai/helpers';
import {
  buildPostingTimeRecommendation,
  generateDefaultPostingTimes,
  toPostingWindowPosts,
} from './posting-time-recommendation.util';

const HOUR = 60 * 60 * 1000;
const PUBLISHED = new Date('2026-09-01T12:00:00Z');

function result(overrides: Partial<PostingWindowResult>): PostingWindowResult {
  return {
    basis: 'default',
    eligibleCount: 6,
    excluded: {
      invalid_metric: 0,
      invalid_publish_date: 0,
      no_metrics: 0,
      not_yet_published: 0,
      outside_observation_window: 0,
      promoted: 0,
      soft_deleted: 0,
    },
    method: 'median-by-slot',
    options: { ...DEFAULT_POSTING_WINDOW_OPTIONS },
    spanDays: 12.04,
    status: 'insufficient_data',
    timezone: 'Europe/Malta',
    windows: [],
    ...overrides,
  };
}

describe('toPostingWindowPosts', () => {
  it('prefers the read taken 24 to 48 hours after publishing', () => {
    const [post] = toPostingWindowPosts(
      [{ id: 'p1', publishedAt: PUBLISHED }],
      [
        {
          engagementRate: 0.01,
          measuredAt: new Date(PUBLISHED.getTime() + 2 * HOUR),
          postId: 'p1',
        },
        {
          engagementRate: 0.04,
          measuredAt: new Date(PUBLISHED.getTime() + 30 * HOUR),
          postId: 'p1',
        },
        {
          engagementRate: 0.09,
          measuredAt: new Date(PUBLISHED.getTime() + 200 * HOUR),
          postId: 'p1',
        },
      ],
    );

    expect(post.metric).toBe(0.04);
    expect(post.measuredAtMs).toBe(PUBLISHED.getTime() + 30 * HOUR);
  });

  it('keeps the latest read when none is in the window, so the ranking counts it out', () => {
    const [post] = toPostingWindowPosts(
      [{ id: 'p1', publishedAt: PUBLISHED }],
      [
        {
          engagementRate: 0.01,
          measuredAt: new Date(PUBLISHED.getTime() + 2 * HOUR),
          postId: 'p1',
        },
        {
          engagementRate: 0.09,
          measuredAt: new Date(PUBLISHED.getTime() + 200 * HOUR),
          postId: 'p1',
        },
      ],
    );

    expect(post.metric).toBe(0.09);
  });

  it('leaves a post with no usable engagement rate unmeasured instead of zero', () => {
    const [post] = toPostingWindowPosts(
      [{ id: 'p1', publishedAt: PUBLISHED }],
      [
        {
          engagementRate: null,
          measuredAt: new Date(PUBLISHED.getTime() + 30 * HOUR),
          postId: 'p1',
        },
      ],
    );

    expect(post.metric).toBeNull();
    expect(post.measuredAtMs).toBeNull();
  });

  it('skips posts that were never published and reads of other posts', () => {
    const posts = toPostingWindowPosts(
      [
        { id: 'draft', publishedAt: null },
        { id: 'p1', publishedAt: PUBLISHED },
      ],
      [
        {
          engagementRate: 0.5,
          measuredAt: new Date(PUBLISHED.getTime() + 30 * HOUR),
          postId: 'other',
        },
      ],
    );

    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ id: 'p1', metric: null });
  });
});

describe('buildPostingTimeRecommendation', () => {
  it('labels the default as not learned and says how much data is missing', () => {
    const recommendation = buildPostingTimeRecommendation(
      'instagram',
      result({}),
    );

    expect(recommendation).toMatchObject({
      basis: 'default',
      eligibleCount: 6,
      method: 'platform-default',
      spanDays: 12,
    });
    expect(recommendation.windows.map((window) => window.startHour)).toEqual([
      11, 19,
    ]);
    expect(recommendation.reasoning[0]).toContain('6 of 20 measured posts');
    expect(recommendation.reasoning[0]).toContain('not learned');
  });

  it('falls back to the general defaults for an unknown platform', () => {
    const recommendation = buildPostingTimeRecommendation(
      'bluesky',
      result({}),
    );

    expect(recommendation.windows).toHaveLength(3);
  });

  it('passes the learned windows through with their sample sizes', () => {
    const recommendation = buildPostingTimeRecommendation(
      'twitter',
      result({
        basis: 'learned',
        eligibleCount: 30,
        spanDays: 40,
        status: 'ready',
        windows: [
          {
            endHour: 12,
            median: 0.05,
            sampleCount: 7,
            startHour: 9,
            weekday: 1,
          },
        ],
      }),
    );

    expect(recommendation).toMatchObject({
      basis: 'learned',
      method: 'median-by-slot',
      windows: [
        { endHour: 12, median: 0.05, sampleCount: 7, startHour: 9, weekday: 1 },
      ],
    });
  });
});

describe('generateDefaultPostingTimes', () => {
  const iso = (dates: Date[]) => dates.map((date) => date.toISOString());

  it('puts the default hours on tomorrow in the account timezone', () => {
    // Twitter defaults are 08, 09, 12 and 17 local; New York is UTC-4 in October.
    expect(
      iso(
        generateDefaultPostingTimes(
          5,
          'twitter',
          'America/New_York',
          Date.parse('2026-10-20T10:00:00Z'),
        ),
      ),
    ).toEqual([
      '2026-10-21T12:00:00.000Z',
      '2026-10-21T13:00:00.000Z',
      '2026-10-21T16:00:00.000Z',
      '2026-10-21T21:00:00.000Z',
      '2026-10-22T12:00:00.000Z',
    ]);
  });

  it('counts tomorrow in local days, not UTC days', () => {
    // 23:30Z on the 20th is already 12:30 on the 21st in Auckland (UTC+13).
    expect(
      iso(
        generateDefaultPostingTimes(
          1,
          'twitter',
          'Pacific/Auckland',
          Date.parse('2026-10-20T23:30:00Z'),
        ),
      ),
    ).toEqual(['2026-10-21T19:00:00.000Z']);
  });

  it('keeps the local hour across the end of daylight saving time', () => {
    // US clocks go back on 2026-11-01: 08:00 is 12:00Z before and 13:00Z after.
    const times = generateDefaultPostingTimes(
      5,
      'twitter',
      'America/New_York',
      Date.parse('2026-10-30T10:00:00Z'),
    );

    expect(times[0].toISOString()).toBe('2026-10-31T12:00:00.000Z');
    expect(times[4].toISOString()).toBe('2026-11-01T13:00:00.000Z');
  });

  it('falls back to the general hours for an unknown platform', () => {
    expect(
      iso(
        generateDefaultPostingTimes(
          1,
          undefined,
          'UTC',
          Date.parse('2026-10-20T10:00:00Z'),
        ),
      ),
    ).toEqual(['2026-10-21T09:00:00.000Z']);
  });

  it('rejects a timezone that does not exist', () => {
    expect(() =>
      generateDefaultPostingTimes(
        1,
        'twitter',
        'Not/AZone',
        Date.parse('2026-10-20T10:00:00Z'),
      ),
    ).toThrow(RangeError);
  });
});
