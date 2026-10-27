import type {
  PostingWindowInput,
  PostingWindowPostInput,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { computePostingWindows } from './posting-windows.helper';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-10-20T00:00:00Z');
const NEW_YORK = 'America/New_York';

function post(
  id: string,
  publishedIso: string,
  metric: number | null,
  overrides: Partial<PostingWindowPostInput> = {},
): PostingWindowPostInput {
  const publishedAtMs = Date.parse(publishedIso);
  return {
    id,
    isDeleted: false,
    isPromoted: false,
    measuredAtMs: metric === null ? null : publishedAtMs + 36 * HOUR,
    metric,
    publishedAtMs,
    ...overrides,
  };
}

function series(
  prefix: string,
  isoDates: string[],
  time: string,
  metrics: number[],
): PostingWindowPostInput[] {
  return isoDates.map((date, index) =>
    post(`${prefix}-${index}`, `${date}T${time}Z`, metrics[index]),
  );
}

// Local times in New York (EDT, UTC-4): Monday 09:30, Wednesday 19:00,
// Friday 12:30, Sunday 01:00 and Thursday 09:00.
function fixturePosts(): PostingWindowPostInput[] {
  return [
    ...series(
      'mon',
      ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'],
      '13:30:00',
      [0.04, 0.05, 0.06, 0.05, 0.05],
    ),
    ...series(
      'wed',
      ['2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30', '2026-10-07'],
      '23:00:00',
      [0.02, 0.02, 0.02, 0.02, 0.02],
    ),
    ...series(
      'fri',
      ['2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02', '2026-10-09'],
      '16:30:00',
      [0.03, 0.03, 0.03, 0.03, 0.03],
    ),
    ...series('sun', ['2026-09-13', '2026-09-20'], '05:00:00', [0.2, 0.2]),
    ...series(
      'thu',
      ['2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01'],
      '13:00:00',
      [0.01, 0.01, 0.01, 0.01],
    ),
  ];
}

function compute(
  posts: PostingWindowPostInput[],
  options: PostingWindowInput['options'] = {},
  timezone = NEW_YORK,
) {
  return computePostingWindows({ nowMs: NOW, options, posts, timezone });
}

describe('computePostingWindows', () => {
  it('ranks local slots by median and reports the sample behind each', () => {
    const result = compute(fixturePosts());

    expect(result.basis).toBe('learned');
    expect(result.status).toBe('ready');
    expect(result.method).toBe('median-by-slot');
    expect(result.eligibleCount).toBe(21);
    expect(result.windows).toEqual([
      { endHour: 12, median: 0.05, sampleCount: 5, startHour: 9, weekday: 0 },
      { endHour: 15, median: 0.03, sampleCount: 5, startHour: 12, weekday: 4 },
      { endHour: 21, median: 0.02, sampleCount: 5, startHour: 18, weekday: 2 },
    ]);
  });

  it('never ranks a slot below the per-slot minimum, however strong it looks', () => {
    const windows = compute(fixturePosts(), { topCount: 10 }).windows;

    // Sunday 01:00 has two posts at 0.2 and would win on value alone.
    expect(
      windows.map(({ weekday, startHour }) => [weekday, startHour]),
    ).toEqual([
      [0, 9],
      [4, 12],
      [2, 18],
      [3, 9],
    ]);
  });

  it('does not let a busy slot beat a better slot just by having more posts', () => {
    const busy = Array.from({ length: 10 }, (_, index) =>
      post(
        `busy-${index}`,
        new Date(
          Date.parse('2026-07-14T14:00:00Z') + index * 7 * 24 * HOUR,
        ).toISOString(),
        0.03,
      ),
    );
    const result = compute(
      [
        ...busy,
        ...series(
          'best',
          ['2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30'],
          '23:00:00',
          [0.06, 0.06, 0.06, 0.06],
        ),
      ],
      { minimumPosts: 5, minimumSpanDays: 0 },
    );

    expect(result.eligibleCount).toBe(14);
    expect(result.windows[0]).toMatchObject({ median: 0.06, weekday: 2 });
    expect(result.windows[1]).toMatchObject({ median: 0.03, sampleCount: 10 });
  });

  it('falls back to defaults when there are too few posts', () => {
    const result = compute(fixturePosts().slice(0, 19));

    expect(result).toMatchObject({
      basis: 'default',
      eligibleCount: 19,
      status: 'insufficient_data',
      windows: [],
    });
  });

  it('falls back to defaults when the posts cover too few days', () => {
    const tightlyPacked = Array.from({ length: 24 }, (_, index) =>
      post(
        `tight-${index}`,
        `2026-10-${String(1 + (index % 10)).padStart(2, '0')}T13:30:00Z`,
        0.04,
      ),
    );
    const result = compute(tightlyPacked);

    expect(result.status).toBe('insufficient_data');
    expect(result.eligibleCount).toBe(24);
    expect(result.spanDays).toBeLessThan(28);
    expect(result.windows).toEqual([]);
  });

  it('counts posts with no metric instead of scoring them as zero', () => {
    const posts = [
      ...fixturePosts(),
      post('unmeasured', '2026-10-06T13:30:00Z', null),
    ];
    const result = compute(posts);

    expect(result.excluded.no_metrics).toBe(1);
    expect(result.eligibleCount).toBe(21);
    expect(result.windows[0].sampleCount).toBe(5);
  });

  it('treats an observed zero as a real value', () => {
    const zeros = series(
      'zero',
      ['2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29'],
      '13:30:00',
      [0, 0, 0, 0],
    );
    const result = compute(zeros, { minimumPosts: 4, minimumSpanDays: 0 });

    expect(result.excluded.no_metrics).toBe(0);
    expect(result.windows).toEqual([
      { endHour: 12, median: 0, sampleCount: 4, startHour: 9, weekday: 1 },
    ]);
  });

  it('compares posts only when read 24 to 48 hours after publishing', () => {
    const early = post('early', '2026-09-08T13:30:00Z', 0.9, {
      measuredAtMs: Date.parse('2026-09-08T15:30:00Z'),
    });
    const late = post('late', '2026-09-08T13:30:00Z', 0.9, {
      measuredAtMs: Date.parse('2026-09-11T13:30:00Z'),
    });
    const edge = post('edge', '2026-09-08T13:30:00Z', 0.9, {
      measuredAtMs: Date.parse('2026-09-10T13:30:00Z'),
    });
    const result = compute([...fixturePosts(), early, late, edge]);

    expect(result.excluded.outside_observation_window).toBe(2);
    expect(result.eligibleCount).toBe(22);
  });

  it('drops deleted, promoted, future and malformed posts and says why', () => {
    const extras = [
      post('deleted', '2026-09-08T13:30:00Z', 0.5, { isDeleted: true }),
      post('promoted', '2026-09-08T13:30:00Z', 0.5, { isPromoted: true }),
      post('future', '2026-11-01T13:30:00Z', 0.5),
      post('bad-date', '2026-09-08T13:30:00Z', 0.5, {
        publishedAtMs: Number.NaN,
      }),
      post('negative', '2026-09-08T13:30:00Z', -1),
    ];
    const result = compute([...fixturePosts(), ...extras]);

    expect(result.excluded).toMatchObject({
      invalid_metric: 1,
      invalid_publish_date: 1,
      not_yet_published: 1,
      promoted: 1,
      soft_deleted: 1,
    });
    expect(result.eligibleCount).toBe(21);
  });

  it('keeps posts whose promoted flag is unknown', () => {
    const unknown = fixturePosts().map((entry) => ({
      ...entry,
      isPromoted: null,
    }));

    expect(compute(unknown).eligibleCount).toBe(21);
  });

  it('puts posts on either side of a DST change in the same local slot', () => {
    // Saturday 09:00 local: 14:00Z before the change (EST), 13:00Z after (EDT).
    const result = compute(
      [
        post('before', '2026-03-07T14:00:00Z', 0.04),
        post('after', '2026-03-14T13:00:00Z', 0.06),
      ],
      { minimumPosts: 2, minimumPostsPerSlot: 2, minimumSpanDays: 0 },
    );

    expect(result.windows).toEqual([
      { endHour: 12, median: 0.05, sampleCount: 2, startHour: 9, weekday: 5 },
    ]);
  });

  it('buckets in the account timezone, not the server timezone', () => {
    const posts = series(
      'tz',
      ['2026-09-08', '2026-09-15', '2026-09-22'],
      '13:30:00',
      [0.05, 0.05, 0.05],
    );
    const options = { minimumPosts: 3, minimumSpanDays: 0 };

    expect(compute(posts, options, 'UTC').windows[0]).toMatchObject({
      startHour: 12,
      weekday: 1,
    });
    expect(compute(posts, options, 'Asia/Tokyo').windows[0]).toMatchObject({
      startHour: 21,
      weekday: 1,
    });
  });

  it('breaks ties by more posts, then by the earlier slot', () => {
    const posts = [
      ...series(
        'late',
        ['2026-09-08', '2026-09-15', '2026-09-22'],
        '23:00:00',
        [0.05, 0.05, 0.05],
      ),
      ...series(
        'early',
        ['2026-09-09', '2026-09-16', '2026-09-23'],
        '13:30:00',
        [0.05, 0.05, 0.05],
      ),
      ...series(
        'many',
        ['2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01'],
        '13:30:00',
        [0.05, 0.05, 0.05, 0.05],
      ),
    ];
    const result = compute(posts, { minimumPosts: 10, minimumSpanDays: 0 });

    expect(
      result.windows.map(({ weekday, sampleCount }) => [weekday, sampleCount]),
    ).toEqual([
      [3, 4],
      [1, 3],
      [2, 3],
    ]);
  });

  it('is independent of input order', () => {
    const forward = compute(fixturePosts());
    const reversed = compute([...fixturePosts()].reverse());

    expect(reversed).toEqual(forward);
  });

  it('rejects options and timezones it cannot honour', () => {
    expect(() => compute([], {}, 'Not/AZone')).toThrow(RangeError);
    expect(() => compute([], { slotHours: 5 })).toThrow(RangeError);
    expect(() => compute([], { topCount: 0 })).toThrow(RangeError);
    expect(() =>
      compute([], { observationMaxMs: HOUR, observationMinMs: 2 * HOUR }),
    ).toThrow(RangeError);
  });

  it('returns no windows and zero span for no posts', () => {
    expect(compute([])).toMatchObject({
      basis: 'default',
      eligibleCount: 0,
      spanDays: 0,
      status: 'insufficient_data',
      windows: [],
    });
  });
});
