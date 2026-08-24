import {
  ADS_INSIGHTS_PRESET_DAYS,
  emptyUnifiedInsights,
  formatAdsInsightsDate,
  INVALID_ADS_INSIGHTS_DATE_RANGE_MESSAGE,
  isAdsInsightsPreset,
  parseAdsInsightsCalendarDate,
  parseAdsInsightsQuery,
  resolveAdsInsightsDateRange,
  resolveAdsInsightsPresetRange,
} from '@api/services/ads-gateway/ads-insights-range.util';

const FIXED_NOW = new Date('2026-08-19T12:00:00.000Z');

describe('ads-insights-range.util', () => {
  describe('formatAdsInsightsDate', () => {
    it('formats a date as YYYY-MM-DD from UTC ISO', () => {
      expect(formatAdsInsightsDate(new Date('2026-03-07T15:30:00.000Z'))).toBe(
        '2026-03-07',
      );
    });

    it('keeps the UTC calendar day near midnight rather than the local day', () => {
      expect(formatAdsInsightsDate(new Date('2026-08-19T00:30:00.000Z'))).toBe(
        '2026-08-19',
      );
      expect(formatAdsInsightsDate(new Date('2026-08-19T23:30:00.000Z'))).toBe(
        '2026-08-19',
      );
    });
  });

  describe('parseAdsInsightsCalendarDate', () => {
    it('accepts a real zero-padded UTC calendar date', () => {
      expect(parseAdsInsightsCalendarDate('2026-03-07')).toEqual(
        new Date('2026-03-07T00:00:00.000Z'),
      );
    });

    it('accepts a leap day', () => {
      expect(parseAdsInsightsCalendarDate('2024-02-29')).toEqual(
        new Date('2024-02-29T00:00:00.000Z'),
      );
    });

    it.each([
      '2026-02-30',
      '2026-02-29',
      '2026-04-31',
      '2026-13-01',
      '2026-00-01',
      '2026-01-32',
      '2026-3-07',
      '2026-03-7',
      '2026/03/07',
      '03-07-2026',
      '2026-03-07T00:00:00Z',
      '2026-03-07 ',
      ' 2026-03-07',
      'not-a-date',
      '',
    ])('rejects %p rather than rolling over', (value) => {
      expect(parseAdsInsightsCalendarDate(value)).toBeUndefined();
    });
  });

  describe('isAdsInsightsPreset', () => {
    it.each([
      'today',
      'yesterday',
      'last_7d',
      'last_14d',
      'last_30d',
      'last_90d',
    ] as const)('accepts %s', (preset) => {
      expect(isAdsInsightsPreset(preset)).toBe(true);
    });

    it.each(['last_quarter', 'last_3d', 'LAST_7D', 'today ', '', '30d'])(
      'rejects %p',
      (preset) => {
        expect(isAdsInsightsPreset(preset)).toBe(false);
      },
    );
  });

  describe('resolveAdsInsightsPresetRange', () => {
    it('maps today to one inclusive UTC calendar day', () => {
      expect(resolveAdsInsightsPresetRange('today', FIXED_NOW)).toEqual({
        endDate: '2026-08-19',
        startDate: '2026-08-19',
      });
    });

    it('maps yesterday to the prior UTC calendar day', () => {
      expect(resolveAdsInsightsPresetRange('yesterday', FIXED_NOW)).toEqual({
        endDate: '2026-08-18',
        startDate: '2026-08-18',
      });
    });

    it.each([
      ['last_7d', '2026-08-12', '2026-08-18'],
      ['last_14d', '2026-08-05', '2026-08-18'],
      ['last_30d', '2026-07-20', '2026-08-18'],
      ['last_90d', '2026-05-21', '2026-08-18'],
    ] as const)(
      'maps %s to seven-or-more inclusive days ending yesterday UTC',
      (preset, startDate, endDate) => {
        expect(resolveAdsInsightsPresetRange(preset, FIXED_NOW)).toEqual({
          endDate,
          startDate,
        });
      },
    );

    it('crosses month ends in UTC rather than local setDate', () => {
      expect(
        resolveAdsInsightsPresetRange(
          'last_7d',
          new Date('2026-03-01T23:30:00.000Z'),
        ),
      ).toEqual({
        endDate: '2026-02-28',
        startDate: '2026-02-22',
      });
    });
  });

  describe('parseAdsInsightsQuery', () => {
    it('returns empty params when the query omits preset and custom bounds', () => {
      expect(parseAdsInsightsQuery({}, FIXED_NOW)).toEqual({
        isValid: true,
        params: {},
      });
      expect(
        parseAdsInsightsQuery(
          { datePreset: '', since: '', until: '' },
          FIXED_NOW,
        ),
      ).toEqual({
        isValid: true,
        params: {},
      });
    });

    it('normalizes a known preset to an inclusive timeRange', () => {
      expect(
        parseAdsInsightsQuery({ datePreset: 'last_7d' }, FIXED_NOW),
      ).toEqual({
        isValid: true,
        params: {
          timeRange: { since: '2026-08-12', until: '2026-08-18' },
        },
      });
    });

    it('normalizes today to one inclusive UTC day', () => {
      expect(parseAdsInsightsQuery({ datePreset: 'today' }, FIXED_NOW)).toEqual(
        {
          isValid: true,
          params: {
            timeRange: { since: '2026-08-19', until: '2026-08-19' },
          },
        },
      );
    });

    it('accepts a same-day custom range', () => {
      expect(
        parseAdsInsightsQuery(
          { since: '2026-03-07', until: '2026-03-07' },
          FIXED_NOW,
        ),
      ).toEqual({
        isValid: true,
        params: {
          timeRange: { since: '2026-03-07', until: '2026-03-07' },
        },
      });
    });

    it('accepts a multi-day custom range', () => {
      expect(
        parseAdsInsightsQuery(
          { since: '2026-03-01', until: '2026-03-07' },
          FIXED_NOW,
        ),
      ).toEqual({
        isValid: true,
        params: {
          timeRange: { since: '2026-03-01', until: '2026-03-07' },
        },
      });
    });

    it.each([
      ['unknown preset', { datePreset: 'last_quarter' }],
      ['wrong-case preset', { datePreset: 'LAST_7D' }],
      ['partial since', { since: '2026-03-01' }],
      ['partial until', { until: '2026-03-07' }],
      [
        'mixed preset and custom range',
        { datePreset: 'last_7d', since: '2026-03-01', until: '2026-03-07' },
      ],
      [
        'mixed preset and partial custom',
        { datePreset: 'last_7d', since: '2026-03-01' },
      ],
      ['non-calendar since', { since: '2026-02-30', until: '2026-03-01' }],
      ['non-leap until', { since: '2026-03-01', until: '2026-02-29' }],
      ['unpadded until', { since: '2026-03-01', until: '2026-03-1' }],
      ['malformed since', { since: 'not-a-date', until: '2026-03-07' }],
      ['reversed range', { since: '2026-03-07', until: '2026-03-01' }],
    ] as const)('rejects %s with the stable 400 copy', (_label, query) => {
      expect(parseAdsInsightsQuery(query, FIXED_NOW)).toEqual({
        isValid: false,
        message: INVALID_ADS_INSIGHTS_DATE_RANGE_MESSAGE,
      });
    });
  });

  describe('resolveAdsInsightsDateRange', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(FIXED_NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('lets timeRange.since/until win over a datePreset', () => {
      expect(
        resolveAdsInsightsDateRange({
          datePreset: 'last_7d',
          timeRange: { since: '2026-03-01', until: '2026-03-07' },
        }),
      ).toEqual({
        endDate: '2026-03-07',
        startDate: '2026-03-01',
      });
    });

    it('returns undefined when Google has neither timeRange nor datePreset', () => {
      expect(resolveAdsInsightsDateRange()).toBeUndefined();
      expect(resolveAdsInsightsDateRange({})).toBeUndefined();
    });

    it('defaults TikTok to last_30d when no timeRange or datePreset is set', () => {
      expect(
        resolveAdsInsightsDateRange(undefined, { defaultPreset: 'last_30d' }),
      ).toEqual({
        endDate: '2026-08-18',
        startDate: '2026-07-20',
      });
    });

    it.each([
      ['last_7d', '2026-08-12', '2026-08-18'],
      ['last_14d', '2026-08-05', '2026-08-18'],
      ['last_30d', '2026-07-20', '2026-08-18'],
      ['last_90d', '2026-05-21', '2026-08-18'],
      ['today', '2026-08-19', '2026-08-19'],
      ['yesterday', '2026-08-18', '2026-08-18'],
    ] as const)(
      'maps preset %s to inclusive UTC start %s and end %s',
      (preset, startDate, endDate) => {
        expect(resolveAdsInsightsDateRange({ datePreset: preset })).toEqual({
          endDate,
          startDate,
        });
      },
    );

    it('does not silently resolve an unknown preset to 30 days', () => {
      expect(
        resolveAdsInsightsDateRange({ datePreset: 'last_quarter' }),
      ).toBeUndefined();
      expect(
        resolveAdsInsightsDateRange(
          { datePreset: 'last_quarter' },
          { defaultPreset: 'last_30d' },
        ),
      ).toBeUndefined();
    });

    it('treats a blank datePreset as missing unless a defaultPreset is set', () => {
      expect(resolveAdsInsightsDateRange({ datePreset: '' })).toBeUndefined();
      expect(
        resolveAdsInsightsDateRange(
          { datePreset: '' },
          { defaultPreset: 'last_30d' },
        ),
      ).toEqual({
        endDate: '2026-08-18',
        startDate: '2026-07-20',
      });
    });
  });

  describe('ADS_INSIGHTS_PRESET_DAYS', () => {
    it('maps last_7d/14d/30d/90d, today, and yesterday', () => {
      expect(ADS_INSIGHTS_PRESET_DAYS).toEqual({
        last_7d: 7,
        last_14d: 14,
        last_30d: 30,
        last_90d: 90,
        today: 0,
        yesterday: 1,
      });
    });
  });

  describe('emptyUnifiedInsights', () => {
    it('returns the same zero fields for every ads platform', () => {
      expect(emptyUnifiedInsights('google')).toEqual({
        clicks: 0,
        cpc: 0,
        cpm: 0,
        ctr: 0,
        dateStart: '',
        dateStop: '',
        impressions: 0,
        platform: 'google',
        spend: 0,
      });
      expect(emptyUnifiedInsights('tiktok')).toEqual({
        clicks: 0,
        cpc: 0,
        cpm: 0,
        ctr: 0,
        dateStart: '',
        dateStop: '',
        impressions: 0,
        platform: 'tiktok',
        spend: 0,
      });
      expect(emptyUnifiedInsights('meta')).toEqual({
        clicks: 0,
        cpc: 0,
        cpm: 0,
        ctr: 0,
        dateStart: '',
        dateStop: '',
        impressions: 0,
        platform: 'meta',
        spend: 0,
      });
    });
  });
});
