import { BrandRemixSourceResolverService } from '@api/collections/content-runs/services/brand-remix-source-resolver.service';
import {
  importedSourceIdentityDigest,
  importedSourceRootId,
} from '@api/collections/imported-sources/services/imported-source-state';
import type { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BrandRemixAdPlatform } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { AdsPlatform } from '@genfeedai/contracts/interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('BrandRemixSourceResolverService', () => {
  const prisma = {
    credential: { findFirst: vi.fn() },
    ingredient: { findFirst: vi.fn() },
    post: { findFirst: vi.fn() },
    savedAd: { findFirst: vi.fn() },
    sourcePost: { findFirst: vi.fn() },
    trendSourceReference: { findFirst: vi.fn() },
  } as unknown as PrismaService;
  const adsResearchService = { getAdDetail: vi.fn() };
  const runtime = {
    now: () => new Date('2026-08-20T10:00:00.000Z'),
    randomId: () => 'id-1',
  };
  let resolver: BrandRemixSourceResolverService;

  beforeEach(() => {
    vi.resetAllMocks();
    resolver = new BrandRemixSourceResolverService(
      prisma,
      adsResearchService as unknown as AdsResearchService,
      runtime,
    );
  });

  it('recommends copy output for an X source post', async () => {
    (prisma.sourcePost.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        authorHandle: 'vincentshipsit',
        collectedAt: new Date('2026-08-20T10:00:00.000Z'),
        contentType: 'tweet',
        id: 'tweet-1',
        mediaUrls: [],
        metrics: { likes: 12 },
        platform: 'twitter',
        sourceUrl: 'https://x.com/vincentshipsit/status/1',
        text: 'Do not wait for permission to ship.',
        thumbnailUrl: null,
      },
    );

    const resolved = await resolver.resolveSource('org-1', 'brand-1', {
      kind: 'source_post',
      sourcePostId: 'tweet-1',
    });

    expect(resolved.recommendedOutputKind).toBe('copy');
    expect(resolved.snapshot.platform).toBe('x');
    expect(resolved.sourceMedia?.importPolicy).toBe('unknown');
  });

  it('scopes owned-post resolution to organization, brand, and live rows', async () => {
    (prisma.post.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      resolver.resolveSource('org-1', 'brand-1', {
        kind: 'owned_post',
        postId: 'post-other-brand',
      }),
    ).rejects.toThrow();

    expect(prisma.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          brandId: 'brand-1',
          id: 'post-other-brand',
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
  });

  it('resolves a trend reference only through a live tenant-visible trend link', async () => {
    (
      prisma.trendSourceReference.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      authorHandle: 'creator',
      canonicalUrl: 'https://tiktok.example/trend/1?token=secret',
      currentEngagementTotal: 2400,
      data: {
        caption: 'A source caption that remains snapshot-only.',
        title: 'Trend',
      },
      id: 'source-ref-1',
      latestTrendViralityScore: 88,
      platform: 'tiktok',
    });

    const resolved = await resolver.resolveSource('org-1', 'brand-1', {
      kind: 'trend_reference',
      sourceReferenceId: 'source-ref-1',
      trendId: 'trend-1',
    });

    expect(prisma.trendSourceReference.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'source-ref-1',
          isDeleted: false,
        }),
      }),
    );
    expect(resolved.snapshot.canonicalUrl).toBe(
      'https://tiktok.example/trend/1',
    );
    expect(resolved.snapshot.title).not.toContain('token');
  });

  it('rejects a disconnected credential before any ads provider read', async () => {
    (prisma.credential.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );

    await expect(
      resolver.assertConnectedCredential(
        'org-1',
        'brand-1',
        'credential-1',
        BrandRemixAdPlatform.META,
      ),
    ).rejects.toThrow('Ads credential is unavailable');
    expect(adsResearchService.getAdDetail).not.toHaveBeenCalled();
  });

  it('remixes from a live brand-scoped saved snapshot after upstream expiry', async () => {
    (prisma.savedAd.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      body: 'Durable saved copy',
      channel: 'all',
      explanation: 'Stored evidence',
      id: 'saved-1',
      imageUrls: ['https://files.example/copied.jpg'],
      landingPageUrl: 'https://advertiser.example/offer',
      metrics: { impressions: 1200 },
      patternSummary: [{ label: 'Proof', summary: 'Lead with proof' }],
      platform: 'meta',
      previewUrl: 'https://files.example/copied.jpg',
      sourceAdId: 'source-1',
      title: 'Saved winner',
      usagePolicy: 'remix_allowed',
      videoUrls: [],
    });

    const resolved = await resolver.resolveSource('org-1', 'brand-1', {
      kind: 'saved_ad',
      savedAdId: 'saved-1',
    });

    expect(prisma.savedAd.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          brandId: 'brand-1',
          id: 'saved-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
    expect(adsResearchService.getAdDetail).not.toHaveBeenCalled();
    expect(resolved.snapshot.canonicalUrl).toBe(
      'https://files.example/copied.jpg',
    );
    expect(resolved.snapshot.selector.kind).toBe('saved_ad');
    expect(resolved.sourceMedia?.importPolicy).toBe('unknown');
    expect(resolved.sourceMedia?.importPermissionRef).toBeUndefined();
  });

  it('authorizes connected ads against organization and brand before provider reads', async () => {
    (prisma.credential.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        grantedScopes: ['ads_management'],
        grantedScopesCapturedAt: new Date('2026-08-20T09:59:00.000Z'),
        id: 'credential-1',
      },
    );
    adsResearchService.getAdDetail.mockResolvedValue({
      body: 'original ad copy',
      explanation: 'Strong proof',
      id: 'ad-1',
      metrics: { spend: 12 },
      platform: AdsPlatform.META,
      sourceId: 'ad-1',
      title: 'Performance ad',
      usagePolicy: 'remixable',
    });

    const resolved = await resolver.resolveSource('org-1', 'brand-1', {
      adAccountId: 'act-1',
      adId: 'ad-1',
      credentialId: 'credential-1',
      kind: 'connected_ad',
      platform: BrandRemixAdPlatform.META,
    });

    expect(prisma.credential.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          id: 'credential-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(resolved.sourceMedia?.importPolicy).toBe('unknown');
    expect(resolved.sourceMedia?.importPermissionRef).toBeUndefined();
    expect(adsResearchService.getAdDetail).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ brandId: 'brand-1', id: 'ad-1' }),
    );
  });

  it('classifies YouTube sources as embed-only regardless of public media URLs', async () => {
    (prisma.sourcePost.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        id: 'video-1',
        platform: 'youtube',
        text: 'Video example',
        contentType: 'video',
        mediaUrls: ['https://cdn.example/video.mp4'],
        thumbnailUrl: null,
      },
    );
    const resolved = await resolver.resolveSource('org-1', 'brand-1', {
      kind: 'source_post',
      sourcePostId: 'video-1',
    });
    expect(resolved.sourceMedia?.importPolicy).toBe('embed_only');
    expect(resolved.sourceMedia?.importPermissionRef).toBeUndefined();
  });

  describe('imported sources', () => {
    const scope = { brandId: 'brand-1', organizationId: 'org-1' };

    function importedRecord(
      snapshot: Record<string, unknown>,
      providerData: Record<string, unknown> = {},
    ) {
      const stored = {
        captureSurface: 'extension',
        capturedAt: '2026-10-12T10:00:00.000Z',
        contentBasis: 'visible_page',
        evidenceAuthority: 'client_reported',
        kind: 'social',
        provenance: 'imported',
        ...snapshot,
      };
      const digest = importedSourceIdentityDigest(
        scope,
        stored as Parameters<typeof importedSourceIdentityDigest>[1],
      );
      const id = importedSourceRootId(digest);
      return {
        ...scope,
        createdAt: new Date('2026-10-12T10:00:00.000Z'),
        id,
        isDeleted: false,
        providerData: {
          importedSource: {
            captureRevision: 1,
            identityDigest: digest,
            originIngredientId: id,
            snapshot: stored,
            version: 1,
          },
          ...providerData,
        },
        sourceActionId: `imported-source:v1:${digest}`,
        updatedAt: new Date('2026-10-12T10:00:00.000Z'),
        version: 1,
      };
    }

    const xSnapshot = {
      authorHandle: 'author',
      canonicalUrl: 'https://x.com/author/status/1',
      capturedText: 'Do not wait for permission to ship 10 things.',
      host: 'x.com',
      title: 'Ship without permission',
    };

    function select(record: unknown) {
      (prisma.ingredient.findFirst as ReturnType<typeof vi.fn>)
        .mockReset()
        .mockResolvedValueOnce(record);
    }

    it('resolves the stored snapshot by id inside the organization and brand only', async () => {
      const record = importedRecord(xSnapshot);
      select(record);
      const resolved = await resolver.resolveSource('org-1', 'brand-1', {
        importedSourceId: record.id,
        kind: 'imported_source',
      });
      expect(prisma.ingredient.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            brandId: 'brand-1',
            category: 'TEXT',
            id: record.id,
            isDeleted: false,
            organizationId: 'org-1',
            sourceActionId: { startsWith: 'imported-source:v1:' },
          },
        }),
      );
      expect(resolved.recommendedOutputKind).toBe('copy');
      expect(resolved.snapshot).toMatchObject({
        authorHandle: 'author',
        canonicalUrl: 'https://x.com/author/status/1',
        evidence: ['Ship without permission'],
        platform: 'x',
        selector: { importedSourceId: record.id, kind: 'imported_source' },
        sourceId: record.id,
        title: 'Ship without permission',
      });
      // Source copy never becomes brief material; only abstract signals do.
      expect(JSON.stringify(resolved.snapshot.pattern)).not.toContain(
        'permission',
      );
    });

    it('rejects a deleted, foreign or unknown source', async () => {
      select(null);
      await expect(
        resolver.resolveSource('org-1', 'brand-1', {
          importedSourceId: 'cforeign0000000001',
          kind: 'imported_source',
        }),
      ).rejects.toThrow('Imported source');
    });

    it('rejects a record whose stored state is not a valid imported source', async () => {
      select({ ...importedRecord(xSnapshot), providerData: {} });
      await expect(
        resolver.resolveSource('org-1', 'brand-1', {
          importedSourceId: 'cbroken0000000001',
          kind: 'imported_source',
        }),
      ).rejects.toThrow();
    });

    it('keeps an embedded video embed-only and recommends video output', async () => {
      const record = importedRecord({
        canonicalUrl: 'https://www.youtube.com/watch?v=abc123',
        capturedText: 'A public description.',
        host: 'www.youtube.com',
        kind: 'video',
        selectedMedia: {
          availability: 'embed_only',
          kind: 'video',
          url: 'https://www.youtube.com/watch?v=abc123',
        },
        title: 'How it works',
      });
      select(record);
      const resolved = await resolver.resolveSource('org-1', 'brand-1', {
        importedSourceId: record.id,
        kind: 'imported_source',
      });
      expect(resolved.snapshot.platform).toBe('youtube');
      expect(resolved.recommendedOutputKind).toBe('video');
      expect(resolved.sourceMedia).toMatchObject({
        existingAssetIds: [],
        importPolicy: 'embed_only',
        videoUrls: ['https://www.youtube.com/watch?v=abc123'],
      });
      expect(prisma.ingredient.findFirst).toHaveBeenCalledTimes(1);
    });

    it('starts articles, newsletters and podcasts from X copy and stays pattern-only without prepared media', async () => {
      const record = importedRecord({
        canonicalUrl: 'https://blog.example.com/launch',
        capturedText: 'A long article.',
        host: 'blog.example.com',
        kind: 'article',
        selectedMedia: {
          availability: 'accessible',
          kind: 'image',
          url: 'https://blog.example.com/chart.png',
        },
        title: 'Launch notes',
      });
      select(record);
      const resolved = await resolver.resolveSource('org-1', 'brand-1', {
        importedSourceId: record.id,
        kind: 'imported_source',
      });
      expect(resolved.snapshot.platform).toBe('x');
      expect(resolved.recommendedOutputKind).toBe('copy');
      expect(resolved.sourceMedia).toMatchObject({
        existingAssetIds: [],
        imageUrls: [],
        videoUrls: [],
      });
    });

    function preparedRecord() {
      return importedRecord(
        {
          canonicalUrl: 'https://blog.example.com/launch',
          capturedText: 'A long article.',
          host: 'blog.example.com',
          kind: 'image',
          selectedMedia: {
            availability: 'accessible',
            kind: 'image',
            url: 'https://blog.example.com/chart.png',
          },
          title: 'Launch notes',
        },
        {
          importedSourceMedia: {
            bindingRevision: 1,
            mediaIngredientId: 'cmedia000000001',
            mediaKind: 'image',
            mediaUrlDigest: 'd'.repeat(64),
            selectedAt: '2026-10-12T10:00:00.000Z',
            selectedByUserId: 'user-1',
            sourceIdentityDigest: 'e'.repeat(64),
            sourceRecordVersion: 1,
            version: 1,
          },
        },
      );
    }

    it('uses the explicitly prepared Library copy as the analysis asset', async () => {
      const record = preparedRecord();
      (prisma.ingredient.findFirst as ReturnType<typeof vi.fn>)
        .mockReset()
        .mockResolvedValueOnce(record)
        .mockResolvedValueOnce({ id: 'cmedia000000001' });
      const resolved = await resolver.resolveSource('org-1', 'brand-1', {
        importedSourceId: record.id,
        kind: 'imported_source',
      });
      expect(resolved.sourceMedia?.existingAssetIds).toEqual([
        'cmedia000000001',
      ]);
      expect(prisma.ingredient.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            brandId: 'brand-1',
            id: 'cmedia000000001',
            isDeleted: false,
            organizationId: 'org-1',
          }),
        }),
      );
    });

    it('ignores a prepared copy that is not ready or no longer in the Library', async () => {
      const record = preparedRecord();
      (prisma.ingredient.findFirst as ReturnType<typeof vi.fn>)
        .mockReset()
        .mockResolvedValueOnce(record)
        .mockResolvedValueOnce(null);
      const resolved = await resolver.resolveSource('org-1', 'brand-1', {
        importedSourceId: record.id,
        kind: 'imported_source',
      });
      expect(resolved.sourceMedia?.existingAssetIds).toEqual([]);
    });
  });
});
