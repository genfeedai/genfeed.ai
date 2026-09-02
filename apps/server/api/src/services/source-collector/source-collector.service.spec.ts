import { SourceCollectorService } from '@api/services/source-collector/source-collector.service';
import { SocialSourcePlatform } from '@genfeedai/contracts';
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
    collectPost: vi.fn(),
    collectTimeline: vi.fn(),
  };

  const appBearer = {
    name: 'app-bearer',
    platforms: [SocialSourcePlatform.TWITTER],
    canCollect: vi.fn(),
    collectPost: vi.fn(),
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
    collectPost: vi.fn(),
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

  it('discards provider rows that do not have an external post id', async () => {
    apify.canCollect.mockResolvedValue(true);
    apify.collectTimeline.mockResolvedValue({
      handle: 'creator',
      platform: SocialSourcePlatform.TIKTOK,
      posts: [
        {
          id: undefined,
          platform: SocialSourcePlatform.TIKTOK,
          text: '',
        },
        {
          id: 'video-1',
          platform: SocialSourcePlatform.TIKTOK,
          text: 'valid video',
        },
      ],
      provider: 'apify',
    });

    const result = await service.collectTimeline(
      SocialSourcePlatform.TIKTOK,
      'creator',
      {},
    );

    expect(result.posts).toEqual([
      {
        id: 'video-1',
        platform: SocialSourcePlatform.TIKTOK,
        text: 'valid video',
      },
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      'SourceCollector discarded posts without ids',
      expect.objectContaining({ discardedCount: 1, provider: 'apify' }),
    );
  });

  describe('collectPost', () => {
    const reference = {
      authorHandle: 'openai',
      platform: SocialSourcePlatform.TWITTER,
      postId: '123',
      url: 'https://x.com/openai/status/123',
    };

    it('collects one post through the highest-priority capable provider', async () => {
      brandOAuth.canCollect.mockResolvedValue(true);
      brandOAuth.collectPost.mockResolvedValue({
        handle: 'openai',
        platform: SocialSourcePlatform.TWITTER,
        posts: [
          { id: '123', platform: SocialSourcePlatform.TWITTER, text: 'hi' },
        ],
        provider: 'brand-oauth',
      });

      const result = await service.collectPost(reference, {
        brandId: 'b1',
        organizationId: 'o1',
      });

      expect(result.provider).toBe('brand-oauth');
      expect(result.posts[0].id).toBe('123');
      expect(appBearer.collectPost).not.toHaveBeenCalled();
    });

    it('falls through to the next provider on failure', async () => {
      brandOAuth.canCollect.mockResolvedValue(false);
      appBearer.canCollect.mockResolvedValue(true);
      appBearer.collectPost.mockRejectedValue(new Error('bearer down'));
      apify.canCollect.mockResolvedValue(true);
      apify.collectPost.mockResolvedValue({
        handle: 'openai',
        platform: SocialSourcePlatform.TWITTER,
        posts: [
          { id: '123', platform: SocialSourcePlatform.TWITTER, text: 'hi' },
        ],
        provider: 'apify',
      });

      const result = await service.collectPost(reference, {});

      expect(result.provider).toBe('apify');
    });

    it('treats an empty provider result as a failure — no silent empty success', async () => {
      brandOAuth.canCollect.mockResolvedValue(false);
      appBearer.canCollect.mockResolvedValue(false);
      apify.canCollect.mockResolvedValue(true);
      apify.collectPost.mockResolvedValue({
        handle: 'openai',
        platform: SocialSourcePlatform.TWITTER,
        posts: [],
        provider: 'apify',
      });

      await expect(service.collectPost(reference, {})).rejects.toThrow(
        /All single-post collectors failed/,
      );
    });

    it('treats a provider post without an external id as not found', async () => {
      brandOAuth.canCollect.mockResolvedValue(false);
      appBearer.canCollect.mockResolvedValue(false);
      apify.canCollect.mockResolvedValue(true);
      apify.collectPost.mockResolvedValue({
        handle: 'openai',
        platform: SocialSourcePlatform.TWITTER,
        posts: [
          {
            id: '',
            platform: SocialSourcePlatform.TWITTER,
            text: 'missing identity',
          },
        ],
        provider: 'apify',
      });

      await expect(service.collectPost(reference, {})).rejects.toThrow(
        /All single-post collectors failed/,
      );
    });
  });
});
