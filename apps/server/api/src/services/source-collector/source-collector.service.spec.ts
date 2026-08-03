import { SourceCollectorService } from '@api/services/source-collector/source-collector.service';
import { SocialSourcePlatform } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('SourceCollectorService', () => {
  const logger = {
    log: vi.fn(),
    warn: vi.fn(),
  };

  const brandOAuth = {
    name: 'brand-oauth',
    platforms: [SocialSourcePlatform.TWITTER],
    canCollect: vi.fn(),
    collectTimeline: vi.fn(),
  };

  const appBearer = {
    name: 'app-bearer',
    platforms: [SocialSourcePlatform.TWITTER],
    canCollect: vi.fn(),
    collectTimeline: vi.fn(),
  };

  const apify = {
    name: 'apify',
    platforms: [
      SocialSourcePlatform.TWITTER,
      SocialSourcePlatform.INSTAGRAM,
      SocialSourcePlatform.TIKTOK,
    ],
    canCollect: vi.fn(),
    collectTimeline: vi.fn(),
  };

  let service: SourceCollectorService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SourceCollectorService(
      logger as never,
      brandOAuth as never,
      appBearer as never,
      apify as never,
    );
  });

  it('uses brand OAuth when available', async () => {
    brandOAuth.canCollect.mockResolvedValue(true);
    brandOAuth.collectTimeline.mockResolvedValue({
      handle: 'openai',
      platform: SocialSourcePlatform.TWITTER,
      posts: [{ id: '1', text: 'hi', platform: SocialSourcePlatform.TWITTER }],
      provider: 'brand-oauth',
    });

    const result = await service.collectTimeline(
      SocialSourcePlatform.TWITTER,
      'openai',
      { brandId: 'b1', organizationId: 'o1' },
    );

    expect(result.provider).toBe('brand-oauth');
    expect(result.posts).toHaveLength(1);
    expect(appBearer.collectTimeline).not.toHaveBeenCalled();
  });

  it('falls through to app bearer when brand OAuth cannot collect', async () => {
    brandOAuth.canCollect.mockResolvedValue(false);
    appBearer.canCollect.mockResolvedValue(true);
    appBearer.collectTimeline.mockResolvedValue({
      handle: 'openai',
      platform: SocialSourcePlatform.TWITTER,
      posts: [],
      provider: 'app-bearer',
    });

    const result = await service.collectTimeline(
      SocialSourcePlatform.TWITTER,
      'openai',
      {},
    );

    expect(result.provider).toBe('app-bearer');
  });

  it('throws when every provider fails', async () => {
    brandOAuth.canCollect.mockResolvedValue(true);
    brandOAuth.collectTimeline.mockRejectedValue(new Error('oauth down'));
    appBearer.canCollect.mockResolvedValue(true);
    appBearer.collectTimeline.mockRejectedValue(new Error('bearer down'));
    apify.canCollect.mockResolvedValue(true);
    apify.collectTimeline.mockRejectedValue(new Error('apify down'));

    await expect(
      service.collectTimeline(SocialSourcePlatform.TWITTER, 'x', {
        brandId: 'b',
        organizationId: 'o',
      }),
    ).rejects.toThrow(/All source collectors failed/);
  });
});
