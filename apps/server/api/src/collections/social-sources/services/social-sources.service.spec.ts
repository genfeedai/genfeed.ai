vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { SocialSourcesService } from '@api/collections/social-sources/services/social-sources.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SocialSourcePlatform, SocialSourceType } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';

describe('SocialSourcesService', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const sourcePostsService = {
    findByExternalIdScoped: vi.fn(),
    listByBrand: vi.fn(),
    upsertCollectedPosts: vi.fn(),
  };
  const sourceCollector = {
    collectPost: vi.fn(),
    collectTimeline: vi.fn(),
  };
  const brand = {
    findFirst: vi.fn(),
  };
  const credential = {
    findFirst: vi.fn(),
  };
  const socialSource = {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  };

  let service: SocialSourcesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SocialSourcesService(
      { brand, credential, socialSource } as unknown as PrismaService,
      logger,
      sourcePostsService as never,
      sourceCollector as never,
    );
  });

  it('creates a brand-scoped source with normalized handle', async () => {
    brand.findFirst.mockResolvedValue({ id: 'brand-1' });
    socialSource.create.mockResolvedValue({
      brandId: 'brand-1',
      handle: 'openai',
      id: 'source-1',
      organizationId: 'org-1',
      platform: SocialSourcePlatform.TWITTER,
    });

    await service.createScoped(
      { handle: '@OpenAI', platform: SocialSourcePlatform.TWITTER },
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
    );

    expect(brand.findFirst).toHaveBeenCalledWith({
      where: { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(socialSource.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: 'brand-1',
        handle: 'openai',
        organizationId: 'org-1',
        profileUrl: 'https://x.com/openai',
        userId: 'user-1',
      }),
    });
  });

  it('forwards the canonical sourceId filter to source posts', async () => {
    socialSource.findMany.mockResolvedValue([]);
    socialSource.count.mockResolvedValue(0);
    sourcePostsService.listByBrand.mockResolvedValue({
      docs: [],
      total: 0,
    });

    await service.getFeed(
      { brandId: 'brand-1', organizationId: 'org-1' },
      { sourceId: 'source-1' },
    );

    expect(sourcePostsService.listByBrand).toHaveBeenCalledWith(
      { brandId: 'brand-1', organizationId: 'org-1' },
      expect.objectContaining({ sourceId: 'source-1' }),
    );
  });

  it('rejects profile URLs outside the selected platform', async () => {
    brand.findFirst.mockResolvedValue({ id: 'brand-1' });

    await expect(
      service.createScoped(
        {
          handle: 'https://example.com/openai',
          platform: SocialSourcePlatform.TWITTER,
        },
        { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
      ),
    ).rejects.toThrow('Profile URL must use x.com or twitter.com');

    expect(socialSource.create).not.toHaveBeenCalled();
  });

  it('rejects a credential outside the scoped brand and platform', async () => {
    brand.findFirst.mockResolvedValue({ id: 'brand-1' });
    credential.findFirst.mockResolvedValue(null);

    await expect(
      service.createScoped(
        {
          credentialId: 'credential-2',
          handle: '@OpenAI',
          platform: SocialSourcePlatform.TWITTER,
        },
        { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
      ),
    ).rejects.toThrow(
      'Credential is not available for this brand and platform',
    );

    expect(credential.findFirst).toHaveBeenCalledWith({
      where: {
        brandId: 'brand-1',
        id: 'credential-2',
        isDeleted: false,
        organizationId: 'org-1',
        platform: 'TWITTER',
      },
    });
    expect(socialSource.create).not.toHaveBeenCalled();
  });

  it('syncs a source through SourceCollectorService and stores normalized posts', async () => {
    socialSource.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      handle: 'openai',
      id: 'source-1',
      organizationId: 'org-1',
      platform: SocialSourcePlatform.TWITTER,
      userId: 'user-1',
    });
    sourceCollector.collectTimeline.mockResolvedValue({
      handle: 'openai',
      platform: SocialSourcePlatform.TWITTER,
      posts: [
        {
          authorDisplayName: 'OpenAI',
          authorId: 'author-1',
          authorUsername: 'openai',
          contentType: 'tweet',
          contentUrl: 'https://x.com/openai/status/1',
          createdAt: new Date('2026-07-08T10:00:00Z'),
          id: 'tweet-1',
          mediaUrls: ['https://cdn.example.com/image.jpg'],
          metrics: { comments: 1, likes: 20 },
          platform: SocialSourcePlatform.TWITTER,
          text: 'AI source post',
        },
      ],
      provider: 'app-bearer',
    });
    sourcePostsService.upsertCollectedPosts.mockResolvedValue({
      posts: [{ externalId: 'tweet-1', id: 'post-1' }],
      rejectedCount: 0,
    });
    socialSource.update.mockResolvedValue({ id: 'source-1' });

    const result = await service.syncSource('source-1', {
      brandId: 'brand-1',
      organizationId: 'org-1',
    });

    expect(sourceCollector.collectTimeline).toHaveBeenCalledWith(
      SocialSourcePlatform.TWITTER,
      'openai',
      {
        brandId: 'brand-1',
        includeReplies: true,
        includeReposts: false,
        limit: 25,
        organizationId: 'org-1',
        sinceId: undefined,
      },
    );
    expect(sourcePostsService.upsertCollectedPosts).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'source-1' }),
      [
        expect.objectContaining({
          authorHandle: 'openai',
          externalId: 'tweet-1',
          mediaUrls: ['https://cdn.example.com/image.jpg'],
          sourceUrl: 'https://x.com/openai/status/1',
        }),
      ],
    );
    expect(result.count).toBe(1);
  });

  it('persists valid posts and reports identifier-less collector records', async () => {
    socialSource.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      handle: 'openai',
      id: 'source-1',
      organizationId: 'org-1',
      platform: SocialSourcePlatform.TWITTER,
      userId: 'user-1',
    });
    sourceCollector.collectTimeline.mockResolvedValue({
      handle: 'openai',
      platform: SocialSourcePlatform.TWITTER,
      posts: [
        {
          authorUsername: 'openai',
          id: undefined,
          platform: SocialSourcePlatform.TWITTER,
          text: 'identifier missing',
        },
        {
          authorUsername: 'openai',
          id: 'tweet-2',
          platform: SocialSourcePlatform.TWITTER,
          text: 'valid post',
        },
      ],
      provider: 'apify',
    } as never);
    sourcePostsService.upsertCollectedPosts.mockResolvedValue({
      posts: [
        {
          authorHandle: 'openai',
          externalId: 'tweet-2',
          id: 'post-2',
        },
      ],
      rejectedCount: 1,
    });
    socialSource.update.mockResolvedValue({ id: 'source-1' });

    const result = await service.syncSource('source-1', {
      brandId: 'brand-1',
      organizationId: 'org-1',
    });

    expect(result).toMatchObject({ count: 1, rejectedCount: 1 });
    expect(socialSource.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        lastPostExternalId: 'tweet-2',
        lastSyncError:
          'Skipped 1 collected post without a stable external identifier',
        lastSyncStatus: 'success',
      }),
      where: {
        brandId: 'brand-1',
        id: 'source-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('records a scoped sync failure before rethrowing', async () => {
    socialSource.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      handle: 'openai',
      id: 'source-1',
      organizationId: 'org-1',
      platform: SocialSourcePlatform.TWITTER,
      userId: 'user-1',
    });
    sourceCollector.collectTimeline.mockRejectedValue(
      new Error('provider unavailable'),
    );
    socialSource.update.mockResolvedValue({ id: 'source-1' });

    await expect(
      service.syncSource('source-1', {
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    ).rejects.toThrow('provider unavailable');

    expect(socialSource.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        lastSyncError: 'provider unavailable',
        lastSyncStatus: 'failed',
      }),
      where: {
        brandId: 'brand-1',
        id: 'source-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('continues syncing a brand after one source fails', async () => {
    socialSource.findMany.mockResolvedValue([
      {
        brandId: 'brand-1',
        handle: 'first',
        id: 'source-1',
        organizationId: 'org-1',
        platform: SocialSourcePlatform.TWITTER,
        userId: 'user-1',
      },
      {
        brandId: 'brand-1',
        handle: 'second',
        id: 'source-2',
        organizationId: 'org-1',
        platform: SocialSourcePlatform.TWITTER,
        userId: 'user-1',
      },
    ]);
    sourceCollector.collectTimeline
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValueOnce({
        handle: 'second',
        platform: SocialSourcePlatform.TWITTER,
        posts: [],
        provider: 'brand-oauth',
      });
    sourcePostsService.upsertCollectedPosts.mockResolvedValue({
      posts: [],
      rejectedCount: 0,
    });
    socialSource.update.mockResolvedValue({ id: 'source-updated' });

    const result = await service.syncBrand({
      brandId: 'brand-1',
      organizationId: 'org-1',
    });

    expect(sourceCollector.collectTimeline).toHaveBeenCalledTimes(2);
    // syncResolvedSource records the failure then rethrows the original error,
    // so syncBrand reports the provider's own message.
    expect(result.failures).toEqual([
      { error: 'first failed', sourceId: 'source-1' },
    ]);
    expect(result.results).toHaveLength(1);
  });

  describe('importPostScoped', () => {
    const context = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    };
    const collectedTweet = {
      authorDisplayName: 'OpenAI',
      authorId: 'author-1',
      authorUsername: 'OpenAI',
      contentType: 'tweet',
      contentUrl: 'https://x.com/openai/status/123',
      createdAt: new Date('2026-08-01T10:00:00Z'),
      id: '123',
      metrics: { comments: 5, likes: 100, shares: 10 },
      platform: SocialSourcePlatform.TWITTER,
      text: 'viral post',
    };

    it('rejects URLs that are not recognizable post links', async () => {
      await expect(
        service.importPostScoped({ url: 'https://x.com/openai' }, context),
      ).rejects.toThrow('not a recognizable');
      expect(sourceCollector.collectPost).not.toHaveBeenCalled();
    });

    it('maps an identifier-less collected post to a bounded import error', async () => {
      brand.findFirst.mockResolvedValue({ id: 'brand-1' });
      sourceCollector.collectPost.mockResolvedValue({
        handle: 'openai',
        platform: SocialSourcePlatform.TWITTER,
        posts: [{ ...collectedTweet, id: undefined }],
        provider: 'apify',
      } as never);

      await expect(
        service.importPostScoped(
          { url: 'https://x.com/openai/status/123' },
          context,
        ),
      ).rejects.toThrow('missing a stable external identifier');

      expect(sourcePostsService.findByExternalIdScoped).not.toHaveBeenCalled();
      expect(sourcePostsService.upsertCollectedPosts).not.toHaveBeenCalled();
    });

    it('imports a post into a new inactive post-type container', async () => {
      brand.findFirst.mockResolvedValue({ id: 'brand-1' });
      sourceCollector.collectPost.mockResolvedValue({
        handle: 'openai',
        platform: SocialSourcePlatform.TWITTER,
        posts: [collectedTweet],
        provider: 'app-bearer',
      });
      sourcePostsService.findByExternalIdScoped.mockResolvedValue(null);
      socialSource.findFirst.mockResolvedValue(null);
      socialSource.create.mockResolvedValue({
        brandId: 'brand-1',
        handle: 'openai',
        id: 'container-1',
        organizationId: 'org-1',
        platform: SocialSourcePlatform.TWITTER,
        sourceType: SocialSourceType.POST,
        userId: 'user-1',
      });
      sourcePostsService.upsertCollectedPosts.mockResolvedValue({
        posts: [{ externalId: '123', id: 'post-1' }],
        rejectedCount: 0,
      });

      const result = await service.importPostScoped(
        { url: 'https://x.com/openai/status/123' },
        context,
      );

      expect(sourceCollector.collectPost).toHaveBeenCalledWith(
        expect.objectContaining({
          authorHandle: 'openai',
          platform: SocialSourcePlatform.TWITTER,
          postId: '123',
        }),
        { brandId: 'brand-1', organizationId: 'org-1' },
      );
      expect(socialSource.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          handle: 'openai',
          isActive: false,
          organizationId: 'org-1',
          sourceType: SocialSourceType.POST,
        }),
      });
      expect(sourcePostsService.upsertCollectedPosts).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'container-1' }),
        [
          expect.objectContaining({
            externalId: '123',
            sourceUrl: 'https://x.com/openai/status/123',
          }),
        ],
      );
      expect(result.deduplicated).toBe(false);
      expect(result.post).toEqual({ externalId: '123', id: 'post-1' });
    });

    it('deduplicates onto the existing item and refreshes metrics', async () => {
      brand.findFirst.mockResolvedValue({ id: 'brand-1' });
      sourceCollector.collectPost.mockResolvedValue({
        handle: 'openai',
        platform: SocialSourcePlatform.TWITTER,
        posts: [{ ...collectedTweet, id: ' 123 ' }],
        provider: 'apify',
      });
      sourcePostsService.findByExternalIdScoped.mockResolvedValue({
        externalId: '123',
        id: 'post-1',
        sourceId: 'source-1',
      });
      socialSource.findFirst.mockResolvedValue({
        brandId: 'brand-1',
        handle: 'openai',
        id: 'source-1',
        organizationId: 'org-1',
        platform: SocialSourcePlatform.TWITTER,
        sourceType: SocialSourceType.ACCOUNT,
        userId: 'user-1',
      });
      sourcePostsService.upsertCollectedPosts.mockResolvedValue({
        posts: [{ externalId: '123', id: 'post-1' }],
        rejectedCount: 0,
      });

      const result = await service.importPostScoped(
        { url: 'https://x.com/openai/status/123' },
        context,
      );

      expect(socialSource.create).not.toHaveBeenCalled();
      expect(sourcePostsService.findByExternalIdScoped).toHaveBeenCalledWith(
        context,
        SocialSourcePlatform.TWITTER,
        '123',
      );
      expect(sourcePostsService.upsertCollectedPosts).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'source-1' }),
        [expect.objectContaining({ externalId: '123' })],
      );
      expect(result.deduplicated).toBe(true);
    });

    it('maps an unresolvable post to an actionable not-found error', async () => {
      brand.findFirst.mockResolvedValue({ id: 'brand-1' });
      sourceCollector.collectPost.mockRejectedValue(
        new Error('Tweet not found via Apify — it may be deleted or private'),
      );

      await expect(
        service.importPostScoped(
          { url: 'https://x.com/openai/status/123' },
          context,
        ),
      ).rejects.toThrow(/could not be resolved/);
      expect(sourcePostsService.upsertCollectedPosts).not.toHaveBeenCalled();
    });

    it('surfaces provider failures as retryable errors, not empty success', async () => {
      brand.findFirst.mockResolvedValue({ id: 'brand-1' });
      sourceCollector.collectPost.mockRejectedValue(
        new Error('rate limited by provider'),
      );

      await expect(
        service.importPostScoped(
          { url: 'https://x.com/openai/status/123' },
          context,
        ),
      ).rejects.toThrow(/Post import failed: rate limited/);
    });
  });

  it('rejects post URLs in follow flows — the silent account-follow regression', async () => {
    brand.findFirst.mockResolvedValue({ id: 'brand-1' });

    await expect(
      service.createScoped(
        {
          handle: 'https://x.com/openai/status/1234567890',
          platform: SocialSourcePlatform.TWITTER,
        },
        { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
      ),
    ).rejects.toThrow(/points to a specific post/);
    expect(socialSource.create).not.toHaveBeenCalled();

    await expect(
      service.validateSource(
        SocialSourcePlatform.TIKTOK,
        'https://www.tiktok.com/@user/video/7000000001',
      ),
    ).rejects.toThrow(/points to a specific post/);
    expect(sourceCollector.collectTimeline).not.toHaveBeenCalled();
  });

  it('refuses timeline sync for imported post containers', async () => {
    socialSource.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      handle: 'openai',
      id: 'container-1',
      organizationId: 'org-1',
      platform: SocialSourcePlatform.TWITTER,
      sourceType: SocialSourceType.POST,
      userId: 'user-1',
    });

    await expect(
      service.syncSource('container-1', {
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    ).rejects.toThrow(/no timeline sync/);
    expect(sourceCollector.collectTimeline).not.toHaveBeenCalled();
  });

  it('scopes source lookup and refreshes profile URL after platform changes', async () => {
    socialSource.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      handle: 'openai',
      id: 'source-1',
      organizationId: 'org-1',
      platform: SocialSourcePlatform.TWITTER,
      userId: 'user-1',
    });
    socialSource.update.mockResolvedValue({ id: 'source-1' });

    await service.updateScoped(
      'source-1',
      { platform: SocialSourcePlatform.TIKTOK },
      { brandId: 'brand-1', organizationId: 'org-1' },
    );

    expect(socialSource.findFirst).toHaveBeenCalledWith({
      where: {
        brandId: 'brand-1',
        id: 'source-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(socialSource.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        platform: SocialSourcePlatform.TIKTOK,
        profileUrl: 'https://www.tiktok.com/@openai',
      }),
      where: {
        brandId: 'brand-1',
        id: 'source-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });
});
