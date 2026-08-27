import {
  DEFAULT_PROMPT_REFERENCE_FRESHNESS_DAYS,
  getTrendFreshnessStatus,
  optionalSourceFields,
  resolveFreshnessWindowDays,
} from './trend-freshness.util';

describe('getTrendFreshnessStatus', () => {
  const generatedAt = new Date('2026-06-13T00:00:00.000Z');

  it('marks invalid last-seen timestamps as expired', () => {
    expect(getTrendFreshnessStatus('not-a-date', generatedAt, 2)).toBe(
      'expired',
    );
  });

  it('returns fresh, stale, and expired from the supplied clock', () => {
    expect(
      getTrendFreshnessStatus('2026-06-12T00:00:00.000Z', generatedAt, 2),
    ).toBe('fresh');
    expect(
      getTrendFreshnessStatus(
        '2026-06-12T00:00:00.000Z',
        new Date('2026-06-15T00:00:00.000Z'),
        2,
      ),
    ).toBe('stale');
    expect(
      getTrendFreshnessStatus(
        '2026-06-12T00:00:00.000Z',
        new Date('2026-06-17T00:00:00.000Z'),
        2,
      ),
    ).toBe('expired');
  });
});

describe('optionalSourceFields', () => {
  it('copies text and title only when present', () => {
    expect(optionalSourceFields({ id: '1' }, undefined, undefined)).toEqual({
      id: '1',
    });
    expect(optionalSourceFields({ id: '1' }, 'body', 'Title')).toEqual({
      id: '1',
      text: 'body',
      title: 'Title',
    });
  });
});

describe('resolveFreshnessWindowDays', () => {
  it('defaults to seven days when the source omits a window', () => {
    expect(resolveFreshnessWindowDays()).toBe(
      DEFAULT_PROMPT_REFERENCE_FRESHNESS_DAYS,
    );
    expect(resolveFreshnessWindowDays(2)).toBe(2);
  });
});
