import { describe, expect, it } from 'vitest';
import { formatThreadTime, groupThreadsByRecency } from './group-by-recency';

const NOW = new Date(2026, 10, 5, 15, 30);

function item(id: string, date: string | null) {
  return { date, id };
}

describe('groupThreadsByRecency', () => {
  it('splits items into today, the previous 7 days and earlier, in order', () => {
    const groups = groupThreadsByRecency(
      [
        item('a', new Date(2026, 10, 5, 9, 0).toISOString()),
        item('b', new Date(2026, 10, 4, 23, 0).toISOString()),
        item('c', new Date(2026, 10, 1, 9, 0).toISOString()),
        item('d', new Date(2026, 9, 1, 9, 0).toISOString()),
        item('e', null),
      ],
      (entry) => entry.date,
      NOW,
    );

    expect(
      groups.map((bucket) => [bucket.group, bucket.items.map((i) => i.id)]),
    ).toEqual([
      ['today', ['a']],
      ['last7Days', ['b', 'c']],
      ['earlier', ['d', 'e']],
    ]);
  });

  it('leaves out groups with nothing in them', () => {
    const groups = groupThreadsByRecency(
      [item('a', new Date(2026, 8, 1).toISOString())],
      (entry) => entry.date,
      NOW,
    );

    expect(groups.map((bucket) => bucket.group)).toEqual(['earlier']);
  });
});

describe('formatThreadTime', () => {
  it('shows the time for today and the day for older dates', () => {
    expect(formatThreadTime(new Date(2026, 10, 5, 9, 5), 'en-US', NOW)).toBe(
      '09:05 AM',
    );
    expect(formatThreadTime(new Date(2026, 9, 21, 9, 5), 'en-US', NOW)).toBe(
      'Oct 21',
    );
    expect(formatThreadTime(null, 'en-US', NOW)).toBe('');
  });
});
