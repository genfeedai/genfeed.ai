import {
  buildYoutubeOutliers,
  PublicYoutubeOutliersService,
} from '@api/endpoints/public/services/public-youtube-outliers.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { YoutubePublicProvider } from '@api/services/source-collector/providers/youtube-public.provider';
import type { CollectedSourcePost } from '@api/services/source-collector/source-collector.types';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 24);
const CHANNEL_ID = 'UCabcdefghijklmnopqrstuv';

/** Newest first, like the uploads playlist. `views[0]` is the latest video. */
function channelVideos(views: number[]): CollectedSourcePost[] {
  return views.map((count, index) => ({
    authorDisplayName: 'A channel',
    authorId: CHANNEL_ID,
    contentType: 'video',
    contentUrl: `https://www.youtube.com/watch?v=video${index}`,
    createdAt: new Date(NOW - (index + 3) * DAY),
    id: `video${index}`,
    metrics: { views: count },
    platform: SocialSourcePlatform.YOUTUBE,
    text: `Title ${index}\nA long description`,
    thumbnailUrl: `https://i.ytimg.com/vi/video${index}/hq.jpg`,
  }));
}

describe('buildYoutubeOutliers', () => {
  it('ranks the videos that beat the channel median and tiers them', () => {
    // Twenty ordinary videos at 1,000 views, then one at 4,000 and one at 12,000.
    const views = [...Array(20).fill(1000), 4000, 12000];
    const result = buildYoutubeOutliers(CHANNEL_ID, channelVideos(views), NOW);

    expect(result.status).toBe('ready');
    expect(result.baselineViews).toBe(1000);
    expect(result.videosAnalyzed).toBe(22);
    expect(result.outliers.slice(0, 2)).toEqual([
      expect.objectContaining({
        ratio: 12,
        tier: 'breakout',
        title: 'Title 21',
        views: 12000,
      }),
      expect.objectContaining({ ratio: 4, tier: 'outlier', views: 4000 }),
    ]);
    expect(result.outliers[2]?.tier).toBeNull();
    expect(result.outliers).toHaveLength(10);
  });

  it('keeps only the first line of the text as the title', () => {
    const result = buildYoutubeOutliers(
      CHANNEL_ID,
      channelVideos(Array(6).fill(500)),
      NOW,
    );

    expect(result.outliers[0]?.title).toMatch(/^Title \d$/);
  });

  it('says the channel is too small instead of ranking it', () => {
    const result = buildYoutubeOutliers(
      CHANNEL_ID,
      channelVideos([100, 5000, 200]),
      NOW,
    );

    expect(result.status).toBe('insufficient_data');
    expect(result.baselineViews).toBeNull();
    expect(result.outliers).toEqual([]);
  });

  it('leaves out videos too new to have settled', () => {
    const posts = channelVideos(Array(8).fill(1000));
    posts[0] = { ...posts[0], createdAt: new Date(NOW - 60 * 60 * 1000) };
    posts[0].metrics = { views: 90000 };

    const result = buildYoutubeOutliers(CHANNEL_ID, posts, NOW);

    expect(result.outliers.map((video) => video.videoId)).not.toContain(
      'video0',
    );
  });
});

function serviceWith(provider: Partial<YoutubePublicProvider>) {
  return new PublicYoutubeOutliersService(provider as YoutubePublicProvider);
}

describe('PublicYoutubeOutliersService', () => {
  it('reads the channel the visitor pasted and returns its outliers', async () => {
    const asked: string[] = [];
    const service = serviceWith({
      canCollect: async () => true,
      collectTimeline: async (_platform, handle) => {
        asked.push(handle);
        return {
          handle,
          platform: SocialSourcePlatform.YOUTUBE,
          posts: channelVideos([...Array(20).fill(1000), 6000]),
          provider: 'app-api-key',
        };
      },
    });

    const result = await service.find('https://www.youtube.com/@SomeChannel');

    expect(asked).toEqual(['@SomeChannel']);
    expect(result.channelId).toBe(CHANNEL_ID);
    expect(result.outliers[0]).toEqual(
      expect.objectContaining({ ratio: 6, tier: 'outlier' }),
    );
  });

  it('rejects input that is not a channel', async () => {
    const service = serviceWith({ canCollect: async () => true });

    await expect(
      service.find('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers 404 for a channel YouTube does not know', async () => {
    const service = serviceWith({
      canCollect: async () => true,
      collectTimeline: async () => {
        throw new Error('YouTube public API channel-not-found');
      },
    });

    await expect(service.find('@nobodyhere')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('answers 503 when there is no API key', async () => {
    const service = serviceWith({ canCollect: async () => false });

    await expect(service.find('@somebody')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('answers 503 on a YouTube quota error', async () => {
    const service = serviceWith({
      canCollect: async () => true,
      collectTimeline: async () => {
        throw new Error('YouTube public API quota-limited');
      },
    });

    await expect(service.find('@somebody')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
