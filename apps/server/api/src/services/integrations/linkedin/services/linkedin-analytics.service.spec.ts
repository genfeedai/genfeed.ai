vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((value: string) => value) },
}));

import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { LinkedInAnalyticsService } from './linkedin-analytics.service';

describe('LinkedInAnalyticsService', () => {
  it('combines social actions and share statistics', async () => {
    const httpService = {
      get: vi.fn((url: string) =>
        of(
          url.includes('socialActions')
            ? {
                data: {
                  commentCount: 2,
                  likeCount: 5,
                  reactionsSummary: {
                    aggregatedTotalReactions: { REACTION_TYPE_LIKE: 5 },
                  },
                  viewCount: 100,
                },
              }
            : {
                data: {
                  elements: [
                    {
                      clickCount: 3,
                      impressionCount: 200,
                      shareCount: 4,
                      uniqueImpressionsCount: 150,
                    },
                  ],
                },
              },
        ),
      ),
    } as unknown as HttpService;
    const service = new LinkedInAnalyticsService(
      httpService,
      { error: vi.fn() } as unknown as LoggerService,
      vi.fn().mockResolvedValue({ accessToken: 'token' }),
    );

    await expect(
      service.getMediaAnalytics('organization-1', 'brand-1', 'share-1'),
    ).resolves.toEqual({
      clicks: 3,
      comments: 2,
      engagementRate: 7,
      impressions: 200,
      likes: 5,
      mediaType: undefined,
      reach: 150,
      reactions: { like: 5 },
      shares: 4,
      views: 100,
    });
  });
});
