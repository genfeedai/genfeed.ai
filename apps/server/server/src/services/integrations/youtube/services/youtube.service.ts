import type { ChannelTargetSettings } from '@genfeedai/api-types/contracts';
import { ConfigService } from '@libs/config/config.service';
import { Inject, Injectable } from '@nestjs/common';
import {
  SERVER_TOKENS,
  type ServerYoutubeUploader,
  type YoutubeUploadPostInput,
} from '@server/server.dependencies';
import { YoutubeOAuth2Util } from '@server/shared/utils/youtube-oauth/youtube-oauth.util';
import { OAuth2Client } from 'google-auth-library';
import { google, type youtube_v3 } from 'googleapis';
import { YoutubeAnalyticsService } from './modules/youtube-analytics.service';
import { YoutubeAuthService } from './modules/youtube-auth.service';
import { YoutubeCommentsService } from './modules/youtube-comments.service';
import {
  YoutubeMetadataService,
  type YoutubeVideoMetadata,
} from './modules/youtube-metadata.service';

export type { YoutubeVideoMetadata } from './modules/youtube-metadata.service';

export interface YoutubeTrend {
  channelId?: string;
  channelTitle?: string;
  commentCount: number;
  description?: string;
  id: string;
  likeCount: number;
  publishedAt?: string;
  tags: string[];
  thumbnailUrl?: string;
  title: string;
  viewCount: number;
  url: string;
}

@Injectable()
export class YoutubeService {
  // youtubeAPI is used with per-request auth passed via the auth parameter
  // This is safe because each API call passes its own OAuth client
  public readonly youtubeAPI: youtube_v3.Youtube;
  public readonly youtubeDataAPI: youtube_v3.Youtube;
  private readonly youtubeDataApiConfigured: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: YoutubeAuthService,
    private readonly metadataService: YoutubeMetadataService,
    @Inject(SERVER_TOKENS.youtubeUploads)
    private readonly uploadService: ServerYoutubeUploader,
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
    const auth =
      typeof apiKey === 'string' && apiKey.trim().length > 0
        ? apiKey
        : undefined;
    this.youtubeDataApiConfigured = auth !== undefined;
    this.youtubeDataAPI = google.youtube({
      auth,
      version: 'v3',
    });
  }

  getVideoMetadata(videoId: string): Promise<YoutubeVideoMetadata | null> {
    return this.metadataService.getVideoMetadata(videoId);
  }

  refreshToken(organizationId: string, brandId: string, credentialId?: string) {
    return this.authService.refreshToken(organizationId, brandId, credentialId);
  }

  async getTrends(regionCode = 'US', limit = 20): Promise<YoutubeTrend[]> {
    if (!this.youtubeDataApiConfigured) {
      return [];
    }

    const response = await this.youtubeDataAPI.videos.list({
      chart: 'mostPopular',
      maxResults: Math.max(1, Math.min(50, limit)),
      part: ['id', 'snippet', 'statistics'],
      regionCode,
    });

    return (response.data.items ?? []).flatMap((video) => {
      const id = video.id?.trim();
      const title = video.snippet?.title?.trim();
      if (!id || !title) {
        return [];
      }

      return [
        {
          channelId: video.snippet?.channelId ?? undefined,
          channelTitle: video.snippet?.channelTitle ?? undefined,
          commentCount: Number(video.statistics?.commentCount ?? 0),
          description: video.snippet?.description ?? undefined,
          id,
          likeCount: Number(video.statistics?.likeCount ?? 0),
          publishedAt: video.snippet?.publishedAt ?? undefined,
          tags: video.snippet?.tags ?? [],
          thumbnailUrl:
            video.snippet?.thumbnails?.high?.url ??
            video.snippet?.thumbnails?.medium?.url ??
            video.snippet?.thumbnails?.default?.url ??
            undefined,
          title,
          url: `https://www.youtube.com/watch?v=${id}`,
          viewCount: Number(video.statistics?.viewCount ?? 0),
        },
      ];
    });
  }

  /**
   * @param credentialId - which connected YouTube channel this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  uploadVideo(
    organizationId: string,
    brandId: string,
    videoId: string,
    post: YoutubeUploadPostInput,
    settings: ChannelTargetSettings = {},
    credentialId?: string,
  ) {
    return this.uploadService.uploadVideo(
      organizationId,
      brandId,
      videoId,
      post,
      settings,
      credentialId,
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

  getMediaAnalytics(
    organizationId: string,
    brandId: string,
    videoId: string,
    credentialId?: string,
  ) {
    return this.analyticsService.getMediaAnalytics(
      organizationId,
      brandId,
      videoId,
      credentialId,
    );
  }

  getMediaAnalyticsBatch(
    organizationId: string,
    brandId: string,
    videoIds: string[],
    credentialId?: string,
  ) {
    return this.analyticsService.getMediaAnalyticsBatch(
      organizationId,
      brandId,
      videoIds,
      credentialId,
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
      this.requireOAuthConfig('GOOGLE_OAUTH_CLIENT_ID'),
      this.requireOAuthConfig('GOOGLE_OAUTH_CLIENT_SECRET'),
      this.requireOAuthConfig('YOUTUBE_REDIRECT_URI'),
    );

    const authOptions = {
      access_type: options.accessType || 'offline',
      include_granted_scopes: options.includeGrantedScopes ?? false,
      prompt: options.prompt || 'consent',
      scope: options.scope,
      state: options.state,
    } as unknown as Parameters<OAuth2Client['generateAuthUrl']>[0];

    return oauth2Client.generateAuthUrl(authOptions);
  }

  /**
   * Exchange authorization code for tokens
   * Creates a per-request OAuth client to avoid race conditions
   */
  async exchangeCodeForTokens(code: string): Promise<unknown> {
    const oauth2Client = YoutubeOAuth2Util.createClient(
      this.requireOAuthConfig('GOOGLE_OAUTH_CLIENT_ID'),
      this.requireOAuthConfig('GOOGLE_OAUTH_CLIENT_SECRET'),
      this.requireOAuthConfig('YOUTUBE_REDIRECT_URI'),
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
    credentialId?: string,
  ) {
    return this.commentsService.postComment(
      organizationId,
      brandId,
      videoId,
      text,
      credentialId,
    );
  }

  listRecentChannelComments(
    organizationId: string,
    brandId: string,
    options?: {
      maxResults?: number;
      pageToken?: string;
    },
    credentialId?: string,
  ) {
    return this.commentsService.listRecentChannelComments(
      organizationId,
      brandId,
      options,
      credentialId,
    );
  }

  listVideoComments(
    organizationId: string,
    brandId: string,
    videoId: string,
    maxResults?: number,
    credentialId?: string,
  ) {
    return this.commentsService.listVideoComments(
      organizationId,
      brandId,
      videoId,
      maxResults,
      credentialId,
    );
  }

  replyToComment(
    organizationId: string,
    brandId: string,
    parentCommentId: string,
    text: string,
    credentialId?: string,
  ) {
    return this.commentsService.replyToComment(
      organizationId,
      brandId,
      parentCommentId,
      text,
      credentialId,
    );
  }

  postCommentReply(
    organizationId: string,
    brandId: string,
    parentCommentId: string,
    text: string,
    credentialId?: string,
  ) {
    return this.commentsService.postCommentReply(
      organizationId,
      brandId,
      parentCommentId,
      text,
      credentialId,
    );
  }

  private requireOAuthConfig(
    key:
      | 'GOOGLE_OAUTH_CLIENT_ID'
      | 'GOOGLE_OAUTH_CLIENT_SECRET'
      | 'YOUTUBE_REDIRECT_URI',
  ): string {
    const value = this.configService.get<string>(key);
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${key} is not configured`);
    }

    return value;
  }
}
