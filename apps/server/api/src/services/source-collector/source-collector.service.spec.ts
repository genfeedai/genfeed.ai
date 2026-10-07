import { SourceCollectionFailedException } from '@api/services/source-collector/source-collection-failed.exception';
import { SourceCollectorService } from '@api/services/source-collector/source-collector.service';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';
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
      SocialSourcePlatform.YOUTUBE,
      SocialSourcePlatform.LINKEDIN,
    ],
    canCollect: vi.fn(),
    collectPost: vi.fn(),
    collectTimeline: vi.fn(),
  };

  const instagramOfficial = {
    name: 'brand-oauth',
    platforms: [SocialSourcePlatform.INSTAGRAM],
    canCollect: vi.fn().mockResolvedValue(false),
    collectTimeline: vi.fn(),
  };

  const instagramBusinessDiscovery = {
    name: 'brand-oauth',
    platforms: [SocialSourcePlatform.INSTAGRAM],
    canCollect: vi.fn().mockResolvedValue(false),
    collectTimeline: vi.fn(),
  };

  const youtubeOfficial = {
    name: 'brand-oauth',
    platforms: [SocialSourcePlatform.YOUTUBE],
    canCollect: vi.fn().mockResolvedValue(false),
    collectTimeline: vi.fn(),
  };

  const youtubePublic = {
    name: 'app-api-key',
    platforms: [SocialSourcePlatform.YOUTUBE],
    canCollect: vi.fn().mockResolvedValue(false),
    collectTimeline: vi.fn(),
  };

  const linkedinOfficial = {
    name: 'brand-oauth',
    platforms: [SocialSourcePlatform.LINKEDIN],
    canCollect: vi.fn().mockResolvedValue(false),
    collectTimeline: vi.fn(),
  };

  const tiktokOfficial = {
    name: 'brand-oauth',
    platforms: [SocialSourcePlatform.TIKTOK],
    canCollect: vi.fn().mockResolvedValue(false),
    collectTimeline: vi.fn(),
  };

  let service: SourceCollectorService;

  beforeEach(() => {
    vi.clearAllMocks();
    instagramOfficial.canCollect.mockResolvedValue(false);
    instagramBusinessDiscovery.canCollect.mockResolvedValue(false);
    tiktokOfficial.canCollect.mockResolvedValue(false);
    youtubeOfficial.canCollect.mockResolvedValue(false);
    youtubePublic.canCollect.mockResolvedValue(false);
    service = new SourceCollectorService(
      logger as never,
      brandOAuth as never,
      appBearer as never,
      instagramOfficial as never,
      instagramBusinessDiscovery as never,
      tiktokOfficial as never,
      youtubeOfficial as never,
      youtubePublic as never,
      linkedinOfficial as never,
      apify as never,
    );
  });

  it('prefers the official own-account provider over Apify for Instagram', async () => {
    instagramOfficial.canCollect.mockResolvedValue(true);
    instagramOfficial.collectTimeline.mockResolvedValue({
      handle: 'brand',
      platform: SocialSourcePlatform.INSTAGRAM,
      posts: [
        {
          id: 'm1',
          text: 'own post',
          platform: SocialSourcePlatform.INSTAGRAM,
        },
      ],
      provider: 'brand-oauth',
    });

    const result = await service.collectTimeline(
      SocialSourcePlatform.INSTAGRAM,
      'brand',
      { brandId: 'b1', credentialId: 'c1', organizationId: 'o1' },
    );

    expect(result.provider).toBe('brand-oauth');
    expect(apify.collectTimeline).not.toHaveBeenCalled();
  });

  it('tries Business Discovery before Apify for a non-own Instagram handle', async () => {
    instagramOfficial.canCollect.mockResolvedValue(false);
    instagramBusinessDiscovery.canCollect.mockResolvedValue(true);
    instagramBusinessDiscovery.collectTimeline.mockResolvedValue({
      handle: 'competitor',
      platform: SocialSourcePlatform.INSTAGRAM,
      posts: [
        {
          id: 'd1',
          text: 'competitor post',
          platform: SocialSourcePlatform.INSTAGRAM,
        },
      ],
      provider: 'brand-oauth',
    });

    const result = await service.collectTimeline(
      SocialSourcePlatform.INSTAGRAM,
      'competitor',
      { brandId: 'b1', organizationId: 'o1' },
    );

    expect(result.provider).toBe('brand-oauth');
    expect(result.posts[0].id).toBe('d1');
    expect(apify.collectTimeline).not.toHaveBeenCalled();
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

  describe('when every collector rejects access (#6419)', () => {
    function rejectXChain(apifyError: unknown) {
      brandOAuth.canCollect.mockResolvedValue(true);
      brandOAuth.collectTimeline.mockRejectedValue(
        Object.assign(new Error('Request failed with code 402'), {
          code: 402,
          data: { detail: 'secret-bearing provider body' },
        }),
      );
      appBearer.canCollect.mockResolvedValue(true);
      appBearer.collectTimeline.mockRejectedValue(
        Object.assign(new Error('Request failed'), {
          response: { data: { title: 'Unauthorized' }, status: 401 },
        }),
      );
      apify.canCollect.mockResolvedValue(true);
      apify.collectTimeline.mockRejectedValue(apifyError);
    }

    it('fails as a 424 naming each provider class and status, without provider bodies', async () => {
      rejectXChain(
        Object.assign(new Error('Forbidden'), { response: { status: 403 } }),
      );

      const error = await service
        .collectTimeline(SocialSourcePlatform.TWITTER, 'creator', {})
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(SourceCollectionFailedException);
      const failed = error as SourceCollectionFailedException;
      expect(failed.getStatus()).toBe(HttpStatus.FAILED_DEPENDENCY);
      expect(failed.failures).toEqual([
        { provider: 'brand-oauth', reason: 'payment_required', status: 402 },
        { provider: 'app-bearer', reason: 'unauthorized', status: 401 },
        { provider: 'apify', reason: 'forbidden', status: 403 },
      ]);
      expect(failed.message).toBe(
        'All source collectors failed for twitter/@creator: brand-oauth: quota or plan exhausted (402) | app-bearer: not authorized (401) | apify: access forbidden (403)',
      );
      expect(JSON.stringify(failed.getResponse())).not.toContain(
        'secret-bearing',
      );
    });

    it('stays a 5xx when any collector failed for an unknown reason', async () => {
      rejectXChain(new Error('socket hang up'));

      const error = await service
        .collectTimeline(SocialSourcePlatform.TWITTER, 'creator', {})
        .catch((caught: unknown) => caught);

      expect((error as SourceCollectionFailedException).getStatus()).toBe(
        HttpStatus.BAD_GATEWAY,
      );
    });

    it('reports a 424 when no collector is connected or configured', async () => {
      brandOAuth.canCollect.mockResolvedValue(false);
      appBearer.canCollect.mockResolvedValue(false);
      apify.canCollect.mockResolvedValue(false);

      const error = await service
        .collectTimeline(SocialSourcePlatform.TWITTER, 'creator', {})
        .catch((caught: unknown) => caught);

      expect((error as SourceCollectionFailedException).getStatus()).toBe(
        HttpStatus.FAILED_DEPENDENCY,
      );
      expect((error as Error).message).toContain(
        'no collector is connected or configured',
      );
    });
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

  describe('YouTube public collection (#5159)', () => {
    it('uses the registered YoutubePublicProvider for a public YouTube channel', async () => {
      youtubeOfficial.canCollect.mockResolvedValue(false);
      youtubePublic.canCollect.mockResolvedValue(true);
      youtubePublic.collectTimeline.mockResolvedValue({
        handle: 'creator',
        platform: SocialSourcePlatform.YOUTUBE,
        posts: [
          {
            id: 'v1',
            platform: SocialSourcePlatform.YOUTUBE,
            text: 'upload',
          },
        ],
        provider: 'app-api-key',
      });

      const result = await service.collectTimeline(
        SocialSourcePlatform.YOUTUBE,
        'creator',
        {},
      );

      expect(result.provider).toBe('app-api-key');
      expect(result.posts).toEqual([
        { id: 'v1', platform: SocialSourcePlatform.YOUTUBE, text: 'upload' },
      ]);
      expect(youtubePublic.collectTimeline).toHaveBeenCalledWith(
        SocialSourcePlatform.YOUTUBE,
        'creator',
        {},
      );
      expect(apify.collectTimeline).not.toHaveBeenCalled();
    });

    it('does not start an Apify run when the public provider succeeds with an empty upload list', async () => {
      youtubeOfficial.canCollect.mockResolvedValue(false);
      youtubePublic.canCollect.mockResolvedValue(true);
      youtubePublic.collectTimeline.mockResolvedValue({
        handle: 'creator',
        platform: SocialSourcePlatform.YOUTUBE,
        posts: [],
        provider: 'app-api-key',
      });

      const result = await service.collectTimeline(
        SocialSourcePlatform.YOUTUBE,
        'creator',
        {},
      );

      expect(result.provider).toBe('app-api-key');
      expect(result.posts).toEqual([]);
      expect(apify.collectTimeline).not.toHaveBeenCalled();
      expect(apify.canCollect).not.toHaveBeenCalled();
    });

    it('propagates the failure without fabricating posts when the API key is missing and Apify also cannot collect', async () => {
      youtubeOfficial.canCollect.mockResolvedValue(false);
      // Missing YOUTUBE_API_KEY: the provider's own canCollect reports false.
      youtubePublic.canCollect.mockResolvedValue(false);
      apify.canCollect.mockResolvedValue(false);

      await expect(
        service.collectTimeline(SocialSourcePlatform.YOUTUBE, 'creator', {}),
      ).rejects.toThrow(/All source collectors failed/);
      expect(youtubePublic.collectTimeline).not.toHaveBeenCalled();
      expect(apify.collectTimeline).not.toHaveBeenCalled();
    });

    it('propagates the failure without fabricating posts when the public provider fails and Apify also fails', async () => {
      youtubeOfficial.canCollect.mockResolvedValue(false);
      youtubePublic.canCollect.mockResolvedValue(true);
      youtubePublic.collectTimeline.mockRejectedValue(
        new Error('YouTube public API access-denied'),
      );
      apify.canCollect.mockResolvedValue(true);
      apify.collectTimeline.mockRejectedValue(new Error('apify down'));

      await expect(
        service.collectTimeline(SocialSourcePlatform.YOUTUBE, 'creator', {}),
      ).rejects.toThrow(
        /All source collectors failed.*app-api-key: access forbidden.*apify: failed/s,
      );
    });
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
  it('preserves the governance exception from the final fallback', async () => {
    brandOAuth.canCollect.mockResolvedValue(true);
    brandOAuth.collectTimeline.mockRejectedValue(
      new Error('native unavailable'),
    );
    appBearer.canCollect.mockResolvedValue(false);
    apify.canCollect.mockResolvedValue(true);
    const denied = new ServiceUnavailableException(
      'research_paid_access_required',
    );
    apify.collectTimeline.mockRejectedValue(denied);
    await expect(
      service.collectTimeline(SocialSourcePlatform.TWITTER, 'creator', {
        organizationId: 'org-1',
      }),
    ).rejects.toBe(denied);
    apify.collectPost.mockRejectedValue(denied);
    brandOAuth.collectPost.mockRejectedValue(new Error('native unavailable'));
    await expect(
      service.collectPost({
        platform: SocialSourcePlatform.TWITTER,
        postId: '123',
        authorHandle: null,
        url: 'https://x.com/a/status/123',
      }),
    ).rejects.toBe(denied);
  });
});
