import type { ServerYoutubeUploader } from '@api/server.dependencies';
import type { YoutubeAnalyticsService } from '@api/services/integrations/youtube/services/modules/youtube-analytics.service';
import type { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import type { YoutubeCommentsService } from '@api/services/integrations/youtube/services/modules/youtube-comments.service';
import type { YoutubeMetadataService } from '@api/services/integrations/youtube/services/modules/youtube-metadata.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import type { ConfigService } from '@libs/config/config.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Break circular dependencies: both modules import YoutubeService.
vi.mock(
  '@api/services/integrations/youtube/services/modules/youtube-analytics.service',
  () => ({ YoutubeAnalyticsService: class {} }),
);
vi.mock(
  '@api/services/integrations/youtube/services/modules/youtube-metadata.service',
  () => ({ YoutubeMetadataService: class {} }),
);

interface CatalogVideo {
  id: string;
  popularIn: string[];
  snippet: Record<string, unknown> & { publishedAt: string; title?: string };
  statistics?: Record<string, string>;
}

interface ListArgs {
  chart?: string;
  id?: string[];
  maxResults: number;
  publishedAfter?: string;
  q?: string;
  regionCode?: string;
}

// The YouTube Data API: the regional mostPopular chart, video lookups by id,
// and a keyword search over recent videos ordered by views.
const youtube = vi.hoisted(() => ({
  catalog: [] as CatalogVideo[],
  keysUsed: [] as (string | undefined)[],
}));

vi.mock('googleapis', () => ({
  google: {
    youtube: ({ auth }: { auth?: string }) => {
      const byViews = (a: CatalogVideo, b: CatalogVideo) =>
        Number(b.statistics?.viewCount ?? 0) -
        Number(a.statistics?.viewCount ?? 0);
      return {
        search: {
          list: async ({ maxResults, publishedAfter, q }: ListArgs) => {
            youtube.keysUsed.push(auth);
            const items = youtube.catalog
              .filter(
                (video) =>
                  video.snippet.title?.includes(q ?? '') &&
                  video.snippet.publishedAt >= (publishedAfter ?? ''),
              )
              .sort(byViews)
              .slice(0, maxResults)
              .map((video) => ({ id: { videoId: video.id } }));
            return { data: { items } };
          },
        },
        videos: {
          list: async ({ chart, id, maxResults, regionCode }: ListArgs) => {
            youtube.keysUsed.push(auth);
            const items = youtube.catalog
              .filter((video) =>
                chart === 'mostPopular'
                  ? video.popularIn.includes(regionCode ?? '')
                  : id?.includes(video.id),
              )
              .sort(byViews)
              .slice(0, maxResults);
            return { data: { items } };
          },
        },
      };
    },
  },
}));

const NOW = new Date('2026-09-01T12:00:00.000Z');

const video = (
  id: string,
  fields: Partial<CatalogVideo['snippet']> = {},
  views = 100,
  popularIn: string[] = [],
): CatalogVideo => ({
  id,
  popularIn,
  snippet: {
    channelId: 'channel-1',
    channelTitle: 'Creator',
    description: 'Description',
    publishedAt: '2026-08-29T12:00:00Z',
    tags: ['ai', 'video'],
    thumbnails: { high: { url: `https://img/${id}.jpg` } },
    title: `AI agents ${id}`,
    ...fields,
  },
  statistics: { commentCount: '25', likeCount: '500', viewCount: `${views}` },
});

describe('YoutubeService', () => {
  let apiKey: string;

  const build = () =>
    new YoutubeService(
      { get: () => apiKey } as unknown as ConfigService,
      {
        refreshToken: async (org: string, brand: string, credential?: string) =>
          `${org}/${brand}/${credential ?? 'oldest'} refreshed`,
      } as unknown as YoutubeAuthService,
      {
        getVideoMetadata: async (id: string) => ({ id, title: `Video ${id}` }),
        getVideoStatus: async (_org: string, _brand: string, id: string) => ({
          id,
          status: 'processed',
        }),
      } as unknown as YoutubeMetadataService,
      {
        uploadVideo: async (
          _org: string,
          brand: string,
          id: string,
          post: { label: string },
          _settings: unknown,
          credential?: string,
        ) => `${brand}:${id}:${post.label}:${credential ?? 'oldest'}`,
      } as unknown as ServerYoutubeUploader,
      {
        getMediaAnalytics: async (
          _org: string,
          _brand: string,
          id: string,
          credential: string,
        ) => ({ credential, id, views: 42 }),
        getMediaAnalyticsBatch: async (
          _org: string,
          _brand: string,
          ids: string[],
        ) => ids.map((id) => ({ id, views: 42 })),
      } as unknown as YoutubeAnalyticsService,
      {} as YoutubeCommentsService,
    );

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    apiKey = 'youtube-api-key';
    youtube.catalog = [];
    youtube.keysUsed = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps the regional mostPopular chart into trends with the API key', async () => {
    youtube.catalog = [
      video('video-1', { title: 'Native trend' }, 10_000, ['DE']),
      video('video-us', {}, 99_999, ['US']),
    ];

    await expect(build().getTrends('DE', 10)).resolves.toEqual([
      {
        channelId: 'channel-1',
        channelTitle: 'Creator',
        commentCount: 25,
        description: 'Description',
        id: 'video-1',
        likeCount: 500,
        publishedAt: '2026-08-29T12:00:00Z',
        tags: ['ai', 'video'],
        thumbnailUrl: 'https://img/video-1.jpg',
        title: 'Native trend',
        url: 'https://www.youtube.com/watch?v=video-1',
        viewCount: 10000,
      },
    ]);
    expect(youtube.keysUsed).toEqual(['youtube-api-key']);
  });

  it('searches the brand topic over the last week instead of the global chart', async () => {
    youtube.catalog = [
      video('fresh', {}, 500),
      video('popular-elsewhere', { title: 'Cooking' }, 9_000, ['US']),
      video('stale', { publishedAt: '2026-08-01T00:00:00Z' }, 9_000),
      video('fresher', {}, 900),
    ];

    const trends = await build().getTrends('US', 12, 'AI agents');

    expect(trends.map((trend) => trend.id)).toEqual(['fresher', 'fresh']);
  });

  it('returns no trends when the brand topic has no recent videos', async () => {
    youtube.catalog = [video('popular', { title: 'Cooking' }, 9_000, ['US'])];

    await expect(build().getTrends('US', 12, 'AI agents')).resolves.toEqual([]);
  });

  it.each([
    [1, 0],
    [50, 120],
  ])(
    'caps the chart at %i videos when %i are asked for',
    async (count, limit) => {
      youtube.catalog = Array.from({ length: 60 }, (_, index) =>
        video(`video-${index}`, {}, index, ['US']),
      );

      await expect(build().getTrends('US', limit)).resolves.toHaveLength(count);
    },
  );

  it('skips chart entries without an id or a title', async () => {
    youtube.catalog = [
      video('kept', {}, 3, ['US']),
      video('', {}, 2, ['US']),
      video('untitled', { title: '   ' }, 1, ['US']),
    ];

    const trends = await build().getTrends('US');

    expect(trends.map((trend) => trend.id)).toEqual(['kept']);
  });

  it.each(['', '   '])(
    'returns no native trends without an API key (%j)',
    async (key) => {
      apiKey = key;
      youtube.catalog = [video('video-1', {}, 10, ['US'])];

      await expect(build().getTrends()).resolves.toEqual([]);
      expect(youtube.keysUsed).toEqual([]);
    },
  );

  it.each([
    ['PT1H2M3S', 3723],
    ['PT45S', 45],
    ['PT10M', 600],
    ['P1D', 0],
  ])('reads the ISO 8601 duration %s as %i seconds', (duration, seconds) => {
    expect(build().parseDuration(duration)).toBe(seconds);
  });

  it('answers metadata, token, upload and analytics requests from its modules', async () => {
    const service = build();

    await expect(service.getVideoMetadata('abc')).resolves.toEqual({
      id: 'abc',
      title: 'Video abc',
    });
    await expect(
      service.getVideoStatus('org', 'brand', 'abc'),
    ).resolves.toEqual({ id: 'abc', status: 'processed' });
    await expect(service.refreshToken('org', 'brand')).resolves.toBe(
      'org/brand/oldest refreshed',
    );
    await expect(
      service.uploadVideo(
        'org',
        'brand',
        'video',
        { description: '', label: 'Launch', scheduledDate: NOW },
        {},
        'channel-2',
      ),
    ).resolves.toBe('brand:video:Launch:channel-2');
    await expect(
      service.getMediaAnalytics('org', 'brand', 'vid', 'credential'),
    ).resolves.toEqual({ credential: 'credential', id: 'vid', views: 42 });
    await expect(
      service.getMediaAnalyticsBatch('org', 'brand', ['a', 'b'], 'credential'),
    ).resolves.toEqual([
      { id: 'a', views: 42 },
      { id: 'b', views: 42 },
    ]);
  });
});
