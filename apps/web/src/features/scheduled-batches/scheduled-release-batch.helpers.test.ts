import type { IScheduledReleaseBatchPost } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  getBatchPostDayKey,
  getBatchPostsByTime,
  getKeptBatchPosts,
  groupBatchPostsByDay,
  toBatchPreviewTarget,
  UNSCHEDULED_DAY_KEY,
} from './scheduled-release-batch.helpers';

function post(
  index: number,
  overrides: Partial<IScheduledReleaseBatchPost> = {},
): IScheduledReleaseBatchPost {
  return {
    accountHandle: 'brand',
    accountLabel: 'Brand',
    error: null,
    index,
    isRemoved: false,
    media: [],
    platform: 'twitter',
    releaseId: null,
    scheduledAt: '2026-11-15T08:00:00.000Z',
    text: `Post ${index}`,
    timezone: 'UTC',
    title: `Post ${index}`,
    ...overrides,
  };
}

describe('getBatchPostDayKey', () => {
  it('names the day in the timezone the release carries', () => {
    expect(
      getBatchPostDayKey(
        post(0, {
          scheduledAt: '2026-11-15T23:30:00.000Z',
          timezone: 'Europe/Amsterdam',
        }),
      ),
    ).toBe('2026-11-16');
  });

  it('falls back to UTC for an unknown timezone', () => {
    expect(
      getBatchPostDayKey(
        post(0, {
          scheduledAt: '2026-11-15T23:30:00.000Z',
          timezone: 'Nowhere',
        }),
      ),
    ).toBe('2026-11-15');
  });

  it('puts a post without a time in the unscheduled day', () => {
    expect(getBatchPostDayKey(post(0, { scheduledAt: null }))).toBe(
      UNSCHEDULED_DAY_KEY,
    );
  });
});

describe('groupBatchPostsByDay', () => {
  it('groups by day in time order and keeps unscheduled last', () => {
    const days = groupBatchPostsByDay([
      post(0, { scheduledAt: null }),
      post(1, { scheduledAt: '2026-11-16T08:00:00.000Z' }),
      post(2, { scheduledAt: '2026-11-15T08:00:00.000Z' }),
      post(3, { scheduledAt: '2026-11-16T12:00:00.000Z' }),
    ]);

    expect(days.map((day) => [day.key, day.posts.map((p) => p.index)])).toEqual(
      [
        ['2026-11-15', [2]],
        ['2026-11-16', [1, 3]],
        [UNSCHEDULED_DAY_KEY, [0]],
      ],
    );
  });
});

describe('getBatchPostsByTime', () => {
  it('orders by time, not by the order the posts were sent', () => {
    const ordered = getBatchPostsByTime([
      post(0, { scheduledAt: '2026-11-18T08:00:00.000Z' }),
      post(1, { scheduledAt: null }),
      post(2, { scheduledAt: '2026-11-16T08:00:00.000Z' }),
    ]);

    expect(ordered.map((p) => p.index)).toEqual([2, 0]);
  });
});

describe('getKeptBatchPosts', () => {
  it('drops the posts the reviewer removed, by position', () => {
    const kept = getKeptBatchPosts([post(0), post(1), post(2)], new Set([1]));

    expect(kept.map((p) => p.index)).toEqual([0, 2]);
  });
});

describe('toBatchPreviewTarget', () => {
  it('keeps slides in publishing order and drops audio', () => {
    const target = toBatchPreviewTarget(
      post(4, {
        media: [
          { kind: 'image', order: 2, url: 'https://cdn.example.com/c.jpg' },
          { kind: 'audio', order: 1, url: 'https://cdn.example.com/b.mp3' },
          { kind: 'image', order: 0, url: 'https://cdn.example.com/a.jpg' },
        ],
        platform: 'instagram',
      }),
    );

    expect(target.media?.map((item) => item.url)).toEqual([
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/c.jpg',
    ]);
    expect(target.settings).toEqual({ placement: 'feed' });
    expect(target.caption).toBe('Post 4');
    expect(target.author).toEqual({ handle: 'brand', name: 'Brand' });
  });
});
