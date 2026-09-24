// Sanitized fixture shapes from published actor output examples, verified 2026-09-24:
// https://apify.com/apify/facebook-ads-scraper
// https://apify.com/lexis-solutions/tiktok-ads-scraper
// https://apify.com/lexis-solutions/google-ads-scraper
import { describe, expect, it } from 'vitest';
import {
  normalizeGoogleAdsTransparencyRecord,
  normalizeMetaArchiveRecord,
  normalizeTikTokAdsLibraryRecord,
  publicAdYouTubeEmbedUrl,
} from './public-archive';

describe('published public archive contracts', () => {
  it('maps Meta camelCase without inventing active status or reach', () => {
    const row = normalizeMetaArchiveRecord({
      adArchiveID: '123',
      pageID: '456',
      snapshot: {
        pageName: 'Example',
        body: { text: 'Hello' },
        images: [{ originalImageUrl: 'https://example.com/a.jpg' }],
      },
      startDateFormatted: '2026-01-01',
    });
    expect(row).toMatchObject({
      externalAdId: '123',
      externalAccountId: '456',
      advertiserName: 'Example',
      creativeMediaUrls: ['https://example.com/a.jpg'],
    });
    expect(row?.isHalted).toBeUndefined();
    expect(row?.estimatedReach).toBeUndefined();
  });
  it('maps TikTok library moderation status without calling it active delivery', () => {
    const row = normalizeTikTokAdsLibraryRecord({
      adId: '12',
      advertiserId: '34',
      advertiserName: 'Example',
      status: 'active',
      adType: 2,
      adVideoUrl: 'https://example.com/a.mp4',
      adStartDate: 1767225600000,
      advertiserTtUserId: { username: 'example' },
      advertiserPaidForBy: 'Example Ltd',
    });
    expect(row).toMatchObject({
      externalAdId: '12',
      externalAccountId: '34',
      advertiserHandle: 'example',
      fundingEntity: 'Example Ltd',
      presentationStartDate: '2026-01-01T00:00:00.000Z',
    });
    expect(row?.isHalted).toBeUndefined();
    expect(row?.spend).toBeUndefined();
  });
  it('maps Google seconds and actual platform evidence', () => {
    const row = normalizeGoogleAdsTransparencyRecord({
      creativeId: 'CR123',
      advertiserId: 'AR456',
      advertiserName: 'Example',
      format: 'VIDEO',
      firstShownAt: '1767225600',
      previewUrl: 'https://example.com/a.jpg',
      variants: [
        { textContent: 'Example offer', images: ['https://example.com/b.jpg'] },
      ],
      countryStats: [{ code: 'DE', platformStats: [{ code: 'YOUTUBE' }] }],
    });
    expect(row).toMatchObject({
      externalAdId: 'CR123',
      externalAccountId: 'AR456',
      presentationStartDate: '2026-01-01T00:00:00.000Z',
      bodyText: 'Example offer',
      imageUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
      videoUrls: [],
      targetingCriteria: ['YOUTUBE'],
      targetingCountries: ['DE'],
    });
    expect(row?.isHalted).toBeUndefined();
    expect(row?.impressions).toBeUndefined();
  });
  it('retains the legacy Meta snake_case archive shape', () => {
    expect(
      normalizeMetaArchiveRecord({
        ad_archive_id: '1',
        page_id: '2',
        is_active: true,
        snapshot: {
          page_name: 'Legacy',
          videos: [{ video_hd_url: 'https://example.com/video' }],
        },
        target_locations: [{ name: 'France' }],
      }),
    ).toMatchObject({
      externalAdId: '1',
      externalAccountId: '2',
      isHalted: false,
      videoUrls: ['https://example.com/video'],
      targetingCountries: ['France'],
    });
  });
});

describe('Google creative media URLs', () => {
  it('separates playable media from posters in known actor URL fields', () => {
    const row = normalizeGoogleAdsTransparencyRecord({
      creativeId: 'CR123',
      format: 'VIDEO',
      previewUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      variants: [
        {
          images: [
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'https://example.com/ad.mp4?signature=example',
          ],
        },
      ],
    });
    expect(row?.imageUrls).toEqual([
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    ]);
    expect(row?.videoUrls).toEqual([
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://example.com/ad.mp4?signature=example',
    ]);
  });
  it('builds embeds only from recognized YouTube hosts and valid video IDs', () => {
    expect(publicAdYouTubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    for (const url of [
      'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
      'javascript:alert(1)',
      'https://youtube.com/watch?v=bad',
      'invalid',
    ])
      expect(publicAdYouTubeEmbedUrl(url)).toBeUndefined();
  });
});
