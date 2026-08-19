import {
  ADS_INSIGHTS_PRESET_DAYS,
  emptyUnifiedInsights,
  formatAdsInsightsDate,
  resolveAdsInsightsDateRange,
} from '@api/services/ads-gateway/ads-insights-range.util';

describe('ads-insights-range.util', () => {
  describe('formatAdsInsightsDate', () => {
    it('formats a date as YYYY-MM-DD from UTC ISO', () => {
      expect(formatAdsInsightsDate(new Date('2026-03-07T15:30:00.000Z'))).toBe(
        '2026-03-07',
      );
    });
  });

  describe('resolveAdsInsightsDateRange', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-19T12:00:00.000Z'));
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
      ['last_7d', '2026-08-12'],
      ['last_14d', '2026-08-05'],
      ['last_30d', '2026-07-20'],
      ['last_90d', '2026-05-21'],
      ['today', '2026-08-19'],
      ['yesterday', '2026-08-18'],
    ] as const)(
      'maps preset %s to start %s and yesterday as end',
      (preset, startDate) => {
        expect(resolveAdsInsightsDateRange({ datePreset: preset })).toEqual({
          endDate: '2026-08-18',
          startDate,
        });
      },
    );

    it('falls through unknown presets to 30 days when a range is being resolved', () => {
      expect(
        resolveAdsInsightsDateRange({ datePreset: 'last_quarter' }),
      ).toEqual({
        endDate: '2026-08-18',
        startDate: '2026-07-20',
      });
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
