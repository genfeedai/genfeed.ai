import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import type { IYouTubeVideoStats } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { google, type youtube_v3 } from 'googleapis';

@Injectable()
export class YoutubeAnalyticsService {
  private readonly constructorName = this.constructor.name;
  private readonly youtubeAPI: youtube_v3.Youtube;

  constructor(
    private readonly authService: YoutubeAuthService,
    private readonly loggerService: LoggerService,
  ) {
    this.youtubeAPI = google.youtube({ version: 'v3' });
  }

  getTrends(
    organizationId?: string,
    brandId?: string,
    regionCode = 'US',
  ): unknown[] {
    const url = `${this.constructorName} getTrends organizationId: ${organizationId} brandId: ${brandId}`;

    this.loggerService.log(url);

    return [
      { mentions: 450000, regionCode, topic: 'AI Technology', url: '' },
      { mentions: 380000, topic: 'Gaming', url: '' },
      { mentions: 320000, regionCode, topic: 'Music Videos', url: '' },
      { mentions: 280000, regionCode, topic: 'Tutorials', url: '' },
      { mentions: 240000, regionCode, topic: 'Vlogs', url: '' },
    ];
  }

  async getChannelDetails(
    organizationId: string,
    brandId: string,
    authOrSkipRefresh?: unknown,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      let auth: unknown;
      if (typeof authOrSkipRefresh === 'boolean') {
        this.loggerService.log(
          `${url} started (skipRefresh ignored for safety)`,
          { organizationId },
        );
        auth = await this.authService.refreshToken(organizationId, brandId);
      } else if (authOrSkipRefresh) {
        this.loggerService.log(`${url} started with per-request auth`, {
          organizationId,
        });
        auth = authOrSkipRefresh;
      } else {
        this.loggerService.log(`${url} started`, { organizationId });
        auth = await this.authService.refreshToken(organizationId, brandId);
      }

      const response = await this.youtubeAPI.channels.list({
        auth,
        mine: true,
        part: ['snippet', 'statistics', 'brandingSettings'],
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error('No channel found for the authenticated user');
      }

      const channel = response.data.items[0];
      const snippet = channel.snippet;
      const statistics = channel.statistics;
      const branding = channel.brandingSettings;

      if (!snippet || !statistics || !branding) {
        throw new Error('Failed to get channel details');
      }

      const channelDetails = {
        branding: {
          channel: branding?.channel,
          image: branding?.image,
        },
        country: snippet.country,
        customUrl: snippet.customUrl,
        defaultLanguage: snippet.defaultLanguage,
        description: snippet.description,
        id: channel.id,
        publishedAt: snippet.publishedAt,
        statistics: {
          hiddenSubscriberCount: statistics.hiddenSubscriberCount,
          subscriberCount: parseInt(statistics.subscriberCount || '0', 10),
          videoCount: parseInt(statistics.videoCount || '0', 10),
          viewCount: parseInt(statistics.viewCount || '0', 10),
        },
        thumbnails: snippet.thumbnails,
        title: snippet.title,
      };

      this.loggerService.log(`${url} completed`, { channelId: channel.id });

      return channelDetails;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  async getMediaAnalytics(
    organizationId: string,
    brandId: string,
    videoId: string,
  ) {
    const results = await this.getMediaAnalyticsBatch(organizationId, brandId, [
      videoId,
    ]);

    const result = results.get(videoId);
    if (!result) {
      throw new Error('Statistics not found');
    }

    return result;
  }

  async getMediaAnalyticsBatch(
    organizationId: string,
    brandId: string,
    videoIds: string[],
  ): Promise<Map<string, IYouTubeVideoStats>> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (videoIds.length === 0) {
      return new Map<string, IYouTubeVideoStats>();
    }

    if (videoIds.length > 50) {
      throw new Error('YouTube API supports maximum 50 video IDs per request');
    }

    try {
      const auth = await this.authService.refreshToken(organizationId, brandId);

      const videoData = await this.youtubeAPI.videos.list({
        auth,
        id: videoIds,
        part: ['id', 'statistics', 'contentDetails', 'snippet'],
      });

      const results = new Map<string, IYouTubeVideoStats>();

      for (const item of videoData.data.items || []) {
        if (!item?.id || !item?.statistics) {
          continue;
        }

        const duration = this.parseDuration(
          item.contentDetails?.duration || '',
        );
        const mediaType = duration <= 60 ? 'short' : 'video';

        const views = Number(item.statistics.viewCount || 0);
        const totalEngagements =
          Number(item.statistics.likeCount || 0) +
          Number(item.statistics.commentCount || 0) +
          Number(item.statistics.favoriteCount || 0);
        const engagementRate = views > 0 ? (totalEngagements / views) * 100 : 0;

        results.set(item.id, {
          comments: Number(item.statistics.commentCount || 0),
          dislikes: item.statistics.dislikeCount
            ? Number(item.statistics.dislikeCount)
            : undefined,
          duration,
          engagementRate:
            engagementRate > 0 ? Number(engagementRate.toFixed(2)) : undefined,
          favorites: item.statistics.favoriteCount
            ? Number(item.statistics.favoriteCount)
            : undefined,
          likes: Number(item.statistics.likeCount || 0),
          mediaType,
          views,
        });
      }

      this.loggerService.log(
        `${url} success - fetched analytics for ${results.size} videos`,
      );

      return results;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) {
      return 0;
    }

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
  }
}
