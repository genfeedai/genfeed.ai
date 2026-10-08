import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { InstagramAnalyticsService } from './instagram-analytics.service';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: (value: string) => value },
}));
describe('InstagramAnalyticsService v26 contracts', () => {
  it.each([0, 100])(
    'preserves observed views=%s without relabeling them impressions',
    async (views) => {
      const get = vi.fn().mockReturnValue(
        of({
          data: {
            id: 'media',
            like_count: 2,
            comments_count: 0,
            media_type: 'IMAGE',
            insights: {
              data: [
                { name: 'views', total_value: { value: views } },
                { name: 'reach', values: [{ value: 10 }] },
              ],
            },
          },
        }),
      );
      const service = new InstagramAnalyticsService(
        { get } as unknown as HttpService,
        { error: vi.fn() } as unknown as LoggerService,
        'https://graph.facebook.com',
        'v26.0',
        async () => ({ id: 'credential', accessToken: 'token' }),
      );
      const result = await service.getMediaAnalytics(
        'org',
        'brand',
        'media',
        'credential',
      );
      expect(get).toHaveBeenCalledWith(
        'https://graph.facebook.com/v26.0/media',
        expect.objectContaining({
          params: expect.objectContaining({
            fields: expect.stringContaining('insights.metric(views,'),
          }),
        }),
      );
      expect(result.views).toBe(views);
      expect(result.impressions).toBeUndefined();
      expect(result.learningMetrics?.metrics.views).toEqual({
        value: views,
        availability: 'observed',
        source: 'views',
      });
      expect(result.learningMetrics?.metrics.impressions).toBeUndefined();
      expect(result.reach).toBe(10);
    },
  );
});
