import type { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import {
  TwitterAppBearerProvider,
  TwitterBrandOAuthProvider,
} from '@api/services/source-collector/providers/twitter-official.provider';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const resolveToken = vi.fn(async () => 'test-token');
  const timeline = vi.fn(
    async (
      _handle: string,
      _options?: Parameters<TwitterService['getUserTimelineByUsername']>[1],
    ): Promise<
      Awaited<ReturnType<TwitterService['getUserTimelineByUsername']>>
    > => [
      {
        id: 'tweet-a',
        text: 'An original observation',
        authorId: 'author-a',
        isRetweet: false,
        inReplyToId: null,
        nativeFormat: 'text' as const,
        nativeAuthorVerified: true,
        attachmentMediaKeys: [],
        breakoutExposures: {
          impressions: {
            availability: 'observed' as const,
            value: 0,
            scope: 'organic' as const,
            source: 'twitter:post:organic_metrics.impression_count',
          },
        },
      },
    ],
  );
  const service = {
    resolveBrandUserAccessToken: resolveToken,
    getUserTimelineByUsername: timeline,
  } as unknown as TwitterService;
  return {
    resolveToken,
    timeline,
    oauth: new TwitterBrandOAuthProvider(service),
    bearer: new TwitterAppBearerProvider(service),
  };
}
const context = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'credential-a',
  captureBreakoutEvidence: true,
};

describe('official X timeline prospective exposure metadata', () => {
  it('passes an explicit evidence request only through the winning brand credential and retains organic zero', async () => {
    const h = fixture();
    const result = await h.oauth.collectTimeline(
      SocialSourcePlatform.TWITTER,
      'author',
      context,
    );
    expect(h.resolveToken).toHaveBeenCalledWith(
      context.organizationId,
      context.brandId,
      context.credentialId,
    );
    expect(h.timeline).toHaveBeenCalledWith(
      'author',
      expect.objectContaining({
        accessToken: 'test-token',
        captureBreakoutEvidence: true,
      }),
    );
    expect(result.posts[0]).toMatchObject({
      contentType: 'tweet',
      nativeFormat: 'text',
      nativeAuthorVerified: true,
      attachmentMediaKeys: [],
      breakoutExposures: { impressions: { scope: 'organic', value: 0 } },
    });
    expect(result.posts[0].metrics).toBeUndefined();
  });

  it('does not request restricted metrics from the app bearer fallback', async () => {
    const h = fixture();
    await h.bearer.collectTimeline(
      SocialSourcePlatform.TWITTER,
      'author',
      context,
    );
    expect(h.resolveToken).not.toHaveBeenCalled();
    expect(h.timeline.mock.calls[0][1]).not.toHaveProperty(
      'captureBreakoutEvidence',
    );
    expect(h.timeline.mock.calls[0][1]).not.toHaveProperty('accessToken');
  });

  it('preserves ordinary timeline output when capture was not requested', async () => {
    const h = fixture();
    h.timeline.mockResolvedValueOnce([
      {
        id: 'tweet-a',
        text: 'An original observation',
        authorId: 'author-a',
        isRetweet: false,
        inReplyToId: null,
      },
    ]);
    const { captureBreakoutEvidence: _capture, ...ordinary } = context;
    const result = await h.oauth.collectTimeline(
      SocialSourcePlatform.TWITTER,
      'author',
      ordinary,
    );
    expect(result.posts[0]).not.toHaveProperty('breakoutExposures');
    expect(result.posts[0]).not.toHaveProperty('nativeFormat');
    expect(h.timeline.mock.calls[0][1]).not.toHaveProperty(
      'captureBreakoutEvidence',
    );
  });
});
