import type { PostingWindowResult } from '@genfeedai/contracts/interfaces';
import { DEFAULT_POSTING_WINDOW_OPTIONS } from '@genfeedai/helpers';
import {
  buildPostingTimeRecommendation,
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
