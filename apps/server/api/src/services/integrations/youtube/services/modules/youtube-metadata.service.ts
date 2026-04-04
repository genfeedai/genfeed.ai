import { ConfigService } from '@api/config/config.service';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { google, type youtube_v3 } from 'googleapis';

export interface YoutubeVideoMetadata {
  id: string;
  title?: string;
  description?: string;
  duration?: number;
  viewCount?: number;
  likeCount?: number;
  publishedAt?: Date;
  categoryId?: string;
  tags?: string[];
}

@Injectable()
export class YoutubeMetadataService {
  private readonly constructorName = this.constructor.name;
  private readonly youtubeAPI: youtube_v3.Youtube;
  private readonly youtubeDataAPI: youtube_v3.Youtube;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly youtubeAuthService: YoutubeAuthService,
    private readonly configService: ConfigService,
  ) {
    this.youtubeAPI = google.youtube({ version: 'v3' });

    const apiKey = this.configService.get<string>('YOUTUBE_API_KEY');
    this.youtubeDataAPI = google.youtube({
      // @ts-expect-error TS2339
      auth: apiKey && apiKey.trim().length > 0 ? apiKey : undefined,
      version: 'v3',
    });
  }

  async getVideoMetadata(
    videoId: string,
  ): Promise<YoutubeVideoMetadata | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.youtubeDataAPI.videos.list({
        id: [videoId],
        part: ['snippet', 'statistics', 'contentDetails'],
      });

      const video = response.data.items?.[0];
      if (!video) {
        this.loggerService.warn(`${url} video not found`, { videoId });
        return null;
      }

      const duration = this.parseDuration(video.contentDetails?.duration || '');

      return {
        categoryId: video.snippet?.categoryId || undefined,
        description: video.snippet?.description || undefined,
        duration,
        id: videoId,
        likeCount: video.statistics?.likeCount
          ? Number(video.statistics.likeCount)
          : undefined,
        publishedAt: video.snippet?.publishedAt
          ? new Date(video.snippet.publishedAt)
          : undefined,
        tags: video.snippet?.tags || undefined,
        title: video.snippet?.title || undefined,
        viewCount: video.statistics?.viewCount
          ? Number(video.statistics.viewCount)
          : undefined,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error, { videoId });
      return null;
    }
  }

  async getVideoStatus(
    organizationId: string,
    brandId: string,
    videoId: string,
  ): Promise<{
    privacyStatus: 'public' | 'private' | 'unlisted';
    publishAt?: string;
    uploadStatus?: string;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`);

      const auth = await this.youtubeAuthService.refreshToken(
        organizationId,
        brandId,
      );

      const response = await this.youtubeAPI.videos.list({
        auth,
        id: [videoId],
        part: ['status'],
      });

      const video = response.data.items?.[0];

      if (!video || !video.status) {
        throw new Error('Video not found or status not available');
      }

      const result = {
        privacyStatus: video.status.privacyStatus as
          | 'public'
          | 'private'
          | 'unlisted',
        publishAt: video.status.publishAt ?? undefined,
        uploadStatus: video.status.uploadStatus ?? undefined,
      };

      this.loggerService.log(`${url} completed`, result);

      return result;
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
