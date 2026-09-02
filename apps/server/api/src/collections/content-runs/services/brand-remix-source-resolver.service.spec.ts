import { BrandRemixSourceResolverService } from '@api/collections/content-runs/services/brand-remix-source-resolver.service';
import type { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('BrandRemixSourceResolverService', () => {
  const prisma = {
    credential: { findFirst: vi.fn() },
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
        'meta',
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
      platform: 'meta',
      sourceId: 'ad-1',
      title: 'Performance ad',
      usagePolicy: 'remixable',
    });

    await resolver.resolveSource('org-1', 'brand-1', {
      adAccountId: 'act-1',
      adId: 'ad-1',
      credentialId: 'credential-1',
      kind: 'connected_ad',
      platform: 'meta',
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
    expect(adsResearchService.getAdDetail).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ brandId: 'brand-1', id: 'ad-1' }),
    );
  });
});
