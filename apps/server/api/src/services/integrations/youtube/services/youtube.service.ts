import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { ConfigService } from '@api/config/config.service';
import { YoutubeAnalyticsService } from '@api/services/integrations/youtube/services/modules/youtube-analytics.service';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { YoutubeCommentsService } from '@api/services/integrations/youtube/services/modules/youtube-comments.service';
import {
  YoutubeMetadataService,
  type YoutubeVideoMetadata,
} from '@api/services/integrations/youtube/services/modules/youtube-metadata.service';
import { YoutubeUploadService } from '@api/services/integrations/youtube/services/modules/youtube-upload.service';
import { YoutubeOAuth2Util } from '@api/shared/utils/youtube-oauth/youtube-oauth.util';
import { Injectable } from '@nestjs/common';
import { google, youtube_v3 } from 'googleapis';

export type { YoutubeVideoMetadata } from '@api/services/integrations/youtube/services/modules/youtube-metadata.service';

@Injectable()
export class YoutubeService {
  // youtubeAPI is used with per-request auth passed via the auth parameter
  // This is safe because each API call passes its own OAuth client
  public readonly youtubeAPI: youtube_v3.Youtube;
  public readonly youtubeDataAPI: youtube_v3.Youtube;

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: YoutubeAuthService,
    private readonly metadataService: YoutubeMetadataService,
    private readonly uploadService: YoutubeUploadService,
    private readonly analyticsService: YoutubeAnalyticsService,
    private readonly commentsService: YoutubeCommentsService,
  ) {
    // Create YouTube API client without default auth
    // Each API call will pass its own per-request auth to avoid race conditions
    this.youtubeAPI = google.youtube({
      version: 'v3',
      // No default auth - per-request auth will be passed to each API call
    });

    // Public data API can use API key for quota efficiency
    const apiKey = this.configService.get<string>('YOUTUBE_API_KEY');
    this.youtubeDataAPI = google.youtube({
      // @ts-expect-error TS2339
      auth: apiKey && apiKey.trim().length > 0 ? apiKey : undefined,
      version: 'v3',
    });
  }

  getVideoMetadata(videoId: string): Promise<YoutubeVideoMetadata | null> {
    return this.metadataService.getVideoMetadata(videoId);
  }

  refreshToken(organizationId: string, brandId: string) {
    return this.authService.refreshToken(organizationId, brandId);
  }

  getTrends(organizationId?: string, brandId?: string, regionCode = 'US') {
    return this.analyticsService.getTrends(organizationId, brandId, regionCode);
  }

  uploadVideo(
    organizationId: string,
    brandId: string,
    videoId: string,
    post: PostEntity,
  ) {
    return this.uploadService.uploadVideo(
      organizationId,
      brandId,
      videoId,
      post,
    );
  }

  getVideoStatus(organizationId: string, brandId: string, videoId: string) {
    return this.metadataService.getVideoStatus(
      organizationId,
      brandId,
      videoId,
    );
  }

  getChannelDetails(
    organizationId: string,
    brandId: string,
    authOrSkipRefresh?: unknown,
  ) {
    return this.analyticsService.getChannelDetails(
      organizationId,
      brandId,
      authOrSkipRefresh,
    );
  }

  getMediaAnalytics(organizationId: string, brandId: string, videoId: string) {
    return this.analyticsService.getMediaAnalytics(
      organizationId,
      brandId,
      videoId,
    );
  }

  getMediaAnalyticsBatch(
    organizationId: string,
    brandId: string,
    videoIds: string[],
  ) {
    return this.analyticsService.getMediaAnalyticsBatch(
      organizationId,
      brandId,
      videoIds,
    );
  }

  parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) {
      return 0;
    }

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Generate OAuth authorization URL
   * Creates a per-request OAuth client to avoid race conditions
   */
  generateAuthUrl(options: {
    accessType?: string;
    prompt?: string;
    includeGrantedScopes?: boolean;
    scope: string[];
    state: string;
  }): string {
    const oauth2Client = YoutubeOAuth2Util.createClient(
      this.configService.get('YOUTUBE_CLIENT_ID')!,
      // @ts-expect-error TS2345
      this.configService.get<string>('YOUTUBE_CLIENT_SECRET'),
      this.configService.get<string>('YOUTUBE_REDIRECT_URI'),
    );

    return oauth2Client.generateAuthUrl({
      access_type: options.accessType || 'offline',
      include_granted_scopes: options.includeGrantedScopes ?? false,
      prompt: options.prompt || 'consent',
      scope: options.scope,
      state: options.state,
    });
  }

  /**
   * Exchange authorization code for tokens
   * Creates a per-request OAuth client to avoid race conditions
   */
  async exchangeCodeForTokens(code: string): Promise<unknown> {
    const oauth2Client = YoutubeOAuth2Util.createClient(
      this.configService.get('YOUTUBE_CLIENT_ID')!,
      // @ts-expect-error TS2345
      this.configService.get<string>('YOUTUBE_CLIENT_SECRET'),
      this.configService.get<string>('YOUTUBE_REDIRECT_URI'),
    );

    return await oauth2Client.getToken(code);
  }

  /**
   * Post a comment on a YouTube video
   * @param organizationId The organization ID
   * @param brandId The brand ID
   * @param videoId The YouTube video ID
   * @param text The comment text
   * @returns The comment ID
   */
  postComment(
    organizationId: string,
    brandId: string,
    videoId: string,
    text: string,
  ) {
    return this.commentsService.postComment(
      organizationId,
      brandId,
      videoId,
      text,
    );
  }
}
