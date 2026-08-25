import {
  isPaidCreativePlatform,
  isPaidCreativeResearchSource,
  normalizeAdvertiserHandle,
  PAID_CREATIVE_PLATFORMS,
  PAID_CREATIVE_RESEARCH_SOURCES,
  partitionPaidCreativeMediaUrls,
  resolvePaidCreativeAdPlatform,
  resolvePaidCreativeProvider,
  resolvePaidCreativeSourceLabel,
  resolvePaidCreativeType,
  resolvePaidCreativeUsagePolicy,
} from './paid-creative';

describe('paid creative research contract', () => {
  it('routes YouTube through the Google Ads Transparency Center because YouTube has no separate ad archive', () => {
    expect(resolvePaidCreativeProvider('youtube')).toBe(
      'google_ads_transparency_center',
    );
    expect(resolvePaidCreativeProvider('google')).toBe(
      'google_ads_transparency_center',
    );
  });

  it('maps every watchlist platform to its transparency provider', () => {
    expect(resolvePaidCreativeProvider('meta')).toBe('meta_ads_library');
    expect(resolvePaidCreativeProvider('tiktok')).toBe(
      'tiktok_creative_center',
    );
    expect(resolvePaidCreativeProvider('x')).toBe('x_ads_repository');
  });

  it('keeps X disclosure-only while every marketing archive stays remixable', () => {
    expect(resolvePaidCreativeUsagePolicy('x_ads_repository')).toBe(
      'disclosure_only',
    );

    for (const provider of PAID_CREATIVE_RESEARCH_SOURCES) {
      if (provider === 'x_ads_repository') {
        continue;
      }

      expect(resolvePaidCreativeUsagePolicy(provider)).toBe('remix_allowed');
    }
  });

  it('recognizes only research sources as tenant-owned, never an unresearched public row', () => {
    expect(isPaidCreativeResearchSource('meta_ads_library')).toBe(true);
    expect(isPaidCreativeResearchSource('x_ads_repository')).toBe(true);
    expect(isPaidCreativeResearchSource(null)).toBe(false);
    expect(isPaidCreativeResearchSource(undefined)).toBe(false);
    expect(isPaidCreativeResearchSource('curated_benchmark')).toBe(false);
  });

  it('maps providers onto the ad performance platform vocabulary', () => {
    expect(resolvePaidCreativeAdPlatform('meta_ads_library')).toBe('meta');
    expect(resolvePaidCreativeAdPlatform('tiktok_creative_center')).toBe(
      'tiktok',
    );
    expect(
      resolvePaidCreativeAdPlatform('google_ads_transparency_center'),
    ).toBe('google-ads');
    expect(resolvePaidCreativeAdPlatform('x_ads_repository')).toBe('x_ads');
  });

  it('labels each provider so the research surface can attribute the creative', () => {
    expect(resolvePaidCreativeSourceLabel('meta_ads_library')).toBe(
      'Meta Ad Library',
    );
    expect(resolvePaidCreativeSourceLabel('x_ads_repository')).toBe(
      'X Ads Repository disclosure',
    );
  });

  describe('resolvePaidCreativeType', () => {
    it('trusts an explicit provider ad format over the media extensions', () => {
      expect(
        resolvePaidCreativeType(
          ['https://cdn.example.com/a.jpg'],
          'DCO_CAROUSEL',
        ),
      ).toBe('carousel');
      expect(
        resolvePaidCreativeType(['https://cdn.example.com/a.jpg'], 'VIDEO'),
      ).toBe('video');
    });

    it('detects video from the media url even behind a query string', () => {
      expect(
        resolvePaidCreativeType(['https://cdn.example.com/a.mp4?token=abc']),
      ).toBe('video');
    });

    it('treats multiple images as a carousel and a single image as an image', () => {
      expect(
        resolvePaidCreativeType([
          'https://cdn.example.com/a.jpg',
          'https://cdn.example.com/b.jpg',
        ]),
      ).toBe('carousel');
      expect(resolvePaidCreativeType(['https://cdn.example.com/a.jpg'])).toBe(
        'image',
      );
    });

    it('falls back to text with no media and unknown when the provider named a format we do not model', () => {
      expect(resolvePaidCreativeType(undefined)).toBe('text');
      expect(resolvePaidCreativeType([])).toBe('text');
      expect(resolvePaidCreativeType([], 'PLAYABLE')).toBe('unknown');
    });
  });

  describe('partitionPaidCreativeMediaUrls', () => {
    it('splits a mixed creative into the image and video buckets AdPerformance stores separately', () => {
      expect(
        partitionPaidCreativeMediaUrls([
          'https://cdn.example.com/a.jpg',
          'https://cdn.example.com/b.mp4?token=abc',
          'https://cdn.example.com/c.m3u8',
          'https://cdn.example.com/d.png',
        ]),
      ).toEqual({
        imageUrls: [
          'https://cdn.example.com/a.jpg',
          'https://cdn.example.com/d.png',
        ],
        videoUrls: [
          'https://cdn.example.com/b.mp4?token=abc',
          'https://cdn.example.com/c.m3u8',
        ],
      });
    });

    it('keeps an extensionless asset as an image rather than dropping the creative', () => {
      expect(
        partitionPaidCreativeMediaUrls([
          'https://cdn.example.com/scontent/asset',
        ]),
      ).toEqual({
        imageUrls: ['https://cdn.example.com/scontent/asset'],
        videoUrls: [],
      });
    });

    it('returns empty buckets for a creative with no media', () => {
      expect(partitionPaidCreativeMediaUrls(undefined)).toEqual({
        imageUrls: [],
        videoUrls: [],
      });
    });
  });
});

describe('isPaidCreativePlatform', () => {
  it('recognizes every watchable paid-creative platform', () => {
    for (const platform of PAID_CREATIVE_PLATFORMS) {
      expect(isPaidCreativePlatform(platform)).toBe(true);
    }
  });

  it('rejects unknown, null, and undefined platforms', () => {
    expect(isPaidCreativePlatform('linkedin')).toBe(false);
    expect(isPaidCreativePlatform(null)).toBe(false);
    expect(isPaidCreativePlatform(undefined)).toBe(false);
  });
});

describe('normalizeAdvertiserHandle', () => {
  it('strips a leading @ and lowercases on every platform', () => {
    expect(normalizeAdvertiserHandle('x', '  @AcmeCorp ')).toBe('acmecorp');
    expect(normalizeAdvertiserHandle('meta', '@Acme.Corp')).toBe('acme.corp');
  });

  it('keeps the 15-character X username ceiling', () => {
    expect(normalizeAdvertiserHandle('x', 'a'.repeat(15))).toBe('a'.repeat(15));
    expect(normalizeAdvertiserHandle('x', 'a'.repeat(16))).toBeNull();
  });

  it('allows longer hyphenated Meta and Google advertiser identifiers', () => {
    expect(normalizeAdvertiserHandle('meta', 'acme-corp-global')).toBe(
      'acme-corp-global',
    );
    expect(normalizeAdvertiserHandle('google', 'acme-corp-global')).toBe(
      'acme-corp-global',
    );
    expect(normalizeAdvertiserHandle('youtube', 'acme-corp-global')).toBe(
      'acme-corp-global',
    );
  });

  it('rejects hyphens on TikTok and X, whose usernames never contain them', () => {
    expect(normalizeAdvertiserHandle('tiktok', 'acme-corp')).toBeNull();
    expect(normalizeAdvertiserHandle('x', 'acme-corp')).toBeNull();
  });

  it('rejects handles the database check constraint would reject', () => {
    expect(normalizeAdvertiserHandle('meta', 'acme corp')).toBeNull();
    expect(normalizeAdvertiserHandle('meta', '')).toBeNull();
    expect(normalizeAdvertiserHandle('google', 'a'.repeat(65))).toBeNull();
  });
});
