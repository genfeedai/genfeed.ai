import { DateRangeUtil } from './date-range.util';

const NOW = new Date('2026-08-10T12:34:56.789Z');

describe('DateRangeUtil.parseDateRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to the D-7 through D-1 window', () => {
    const range = DateRangeUtil.parseDateRange();

    expect(range.endDate.toISOString()).toBe('2026-08-09T23:59:59.999Z');
    expect(range.startDate.toISOString()).toBe('2026-08-03T00:00:00.000Z');
  });

  it('honours a custom defaultDays window', () => {
    const range = DateRangeUtil.parseDateRange(undefined, undefined, {
      defaultDays: 30,
    });

    expect(range.startDate.toISOString()).toBe('2026-07-11T00:00:00.000Z');
    expect(range.endDate.toISOString()).toBe('2026-08-09T23:59:59.999Z');
  });

  it('normalises explicit string inputs to day boundaries', () => {
    const range = DateRangeUtil.parseDateRange('2026-07-01', '2026-07-31');

    expect(range.startDate.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(range.endDate.toISOString()).toBe('2026-07-31T23:59:59.999Z');
  });

  it('accepts Date instances as well as strings', () => {
    const range = DateRangeUtil.parseDateRange(
      new Date('2026-07-01T08:00:00.000Z'),
      new Date('2026-07-05T08:00:00.000Z'),
    );

    expect(range.startDate.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(range.endDate.toISOString()).toBe('2026-07-05T23:59:59.999Z');
  });

  it('clamps a future endDate to yesterday because today is incomplete', () => {
    const range = DateRangeUtil.parseDateRange('2026-08-01', '2026-12-31');

    expect(range.endDate.toISOString()).toBe('2026-08-09T23:59:59.999Z');
  });

  it('computes a previous period of matching length ending just before startDate', () => {
    const range = DateRangeUtil.parseDateRange('2026-07-08', '2026-07-14');

    expect(range.previousEndDate.toISOString()).toBe(
      '2026-07-07T23:59:59.999Z',
    );
    expect(range.previousStartDate.toISOString()).toBe(
      '2026-07-01T00:00:00.000Z',
    );
  });

  it('mirrors the current window when the previous period is not requested', () => {
    const range = DateRangeUtil.parseDateRange('2026-07-08', '2026-07-14', {
      includePreviousPeriod: false,
    });

    expect(range.previousStartDate).toEqual(range.startDate);
    expect(range.previousEndDate).toEqual(range.endDate);
  });

  it('rejects a startDate after the endDate', () => {
    expect(() =>
      DateRangeUtil.parseDateRange('2026-07-20', '2026-07-10'),
    ).toThrowError('startDate must be before endDate');
  });

  it('rejects a single-day range', () => {
    expect(() =>
      DateRangeUtil.parseDateRange('2026-07-10', '2026-07-10'),
    ).toThrowError('startDate must be before endDate');
  });

  it('rejects a startDate clamped past the endDate ceiling', () => {
    expect(() =>
      DateRangeUtil.parseDateRange('2026-08-09', '2026-12-31'),
    ).toThrowError('startDate must be before endDate');
  });
});

describe('DateRangeUtil.getDefaultDateRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches parseDateRange called with no arguments', () => {
    expect(DateRangeUtil.getDefaultDateRange()).toEqual(
      DateRangeUtil.parseDateRange(),
    );
  });
});
