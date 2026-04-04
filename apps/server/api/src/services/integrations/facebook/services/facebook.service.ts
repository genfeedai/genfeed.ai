import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import type {
  FacebookInsight,
  FacebookPage,
  FacebookReaction,
} from '@genfeedai/interfaces/integrations/facebook.interface';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class FacebookService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly graphUrl: string = 'https://graph.facebook.com';
  private readonly apiVersion: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {
    this.apiVersion = this.configService.get('FACEBOOK_API_VERSION') || 'v24.0';
  }

  /**
   * Get page access token for a specific page
   */
  private async getPageAccessToken(
    userAccessToken: string,
    pageId: string,
  ): Promise<string> {
    const pagesResponse = await firstValueFrom(
      this.httpService.get(`${this.graphUrl}/${this.apiVersion}/me/accounts`, {
        params: {
          access_token: userAccessToken,
          fields: 'id,access_token',
        },
      }),
    );

    const page = (pagesResponse.data.data as FacebookPage[] | undefined)?.find(
      (p) => p.id === pageId,
    );
    if (!page?.access_token) {
      throw new Error('Page access token not found');
    }

    return page.access_token;
  }

  public generateAuthUrl(state: string): string {
    const clientId = this.configService.get('FACEBOOK_APP_ID');
    const redirectUri = this.configService.get('FACEBOOK_REDIRECT_URI');
    const scope = [
      'ads_management',
      'public_profile',
      'email',
      'pages_show_list',
      'pages_manage_posts',
      'pages_read_engagement',
      'pages_manage_metadata',
      'publish_video',
    ].join(',');

    return `https://www.facebook.com/${this.apiVersion}/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
  }

  public async exchangeAuthCodeForAccessToken(code: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.graphUrl}/${this.apiVersion}/oauth/access_token`,
          {
            params: {
              client_id: this.configService.get('FACEBOOK_APP_ID'),
              client_secret: this.configService.get('FACEBOOK_APP_SECRET'),
              code,
              redirect_uri: this.configService.get('FACEBOOK_REDIRECT_URI'),
            },
          },
        ),
      );

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async getUserProfile(accessToken: string): Promise<{
    id: string;
    name: string;
    email: string;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.graphUrl}/${this.apiVersion}/me`, {
          params: {
            access_token: accessToken,
            fields: 'id,name,email',
          },
        }),
      );

      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async refreshToken(
    organizationId: string,
    brandId: string,
  ): Promise<Record<string, unknown>> {
    const queryCredentials = {
      brand: new Types.ObjectId(brandId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      platform: CredentialPlatform.FACEBOOK,
    };

    const credentials = await this.credentialsService.findOne(queryCredentials);

    if (!credentials) {
      throw new Error('Facebook credential not found');
    }

    try {
      // Facebook uses long-lived tokens that last ~60 days
      // Exchange short-lived token for long-lived token if needed
      if (credentials.accessToken) {
        // Decrypt the access token before use
        const decryptedAccessToken = EncryptionUtil.decrypt(
          credentials.accessToken,
        );

        const response = await firstValueFrom(
          this.httpService.get(
            `${this.graphUrl}/${this.apiVersion}/oauth/access_token`,
            {
              params: {
                client_id: this.configService.get('FACEBOOK_APP_ID'),
                client_secret: this.configService.get('FACEBOOK_APP_SECRET'),
                fb_exchange_token: decryptedAccessToken,
                grant_type: OAuthGrantType.FB_EXCHANGE_TOKEN,
              },
            },
          ),
        );

        const { access_token, expires_in } = response.data;

        return await this.credentialsService.patch(credentials._id, {
          accessToken: access_token,
          accessTokenExpiry: expires_in
            ? new Date(Date.now() + expires_in * 1000)
            : undefined,
          isConnected: true,
          isDeleted: false,
        });
      }

      return credentials;
    } catch (error: unknown) {
      this.loggerService.error('Refresh token failed', error);
      // Mark credential as disconnected if refresh fails
      await this.credentialsService.patch(credentials._id, {
        isConnected: false,
      });
      throw error;
    }
  }

  public async getUserPages(
    organizationId: string,
    brandId: string,
  ): Promise<
    Array<{
      id: string;
      name?: string;
      accessToken?: string;
      category?: string;
      picture?: string;
    }>
  > {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.FACEBOOK,
      });

      if (!credential) {
        throw new Error('Facebook credential not found');
      }

      // Decrypt the access token
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.graphUrl}/${this.apiVersion}/me/accounts`,
          {
            params: {
              access_token: decryptedAccessToken,
              fields: 'id,name,access_token,category,picture',
            },
          },
        ),
      );

      const pages = (response.data.data as FacebookPage[]) || [];

      return pages.map((page) => ({
        accessToken: page.access_token,
        category: page.category,
        id: page.id,
        name: page.name,
        picture: page.picture?.data?.url,
      }));
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async createTextPost(
    pageId: string,
    pageAccessToken: string,
    message: string,
    link?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const params: Record<string, string> = {
        access_token: pageAccessToken,
        message,
      };

      if (link) {
        params.link = link;
      }

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${pageId}/feed`,
          null,
          { params },
        ),
      );

      this.loggerService.log(`${url} succeeded`, response.data);

      return response.data.id;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async uploadImage(
    pageId: string,
    pageAccessToken: string,
    imageUrl: string,
    caption: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${pageId}/photos`,
          null,
          {
            params: {
              access_token: pageAccessToken,
              message: caption,
              url: imageUrl,
            },
          },
        ),
      );

      this.loggerService.log(`${url} succeeded`, response.data);

      return response.data.id;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async uploadVideo(
    organizationId: string,
    brandId: string,
    videoUrl: string,
    title: string,
    description: string,
    pageId?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(organizationId, brandId);

      if (!credential?.accessToken) {
        throw new Error('Facebook credential not found or invalid');
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      const targetPageId = pageId || credential.externalId;
      if (!targetPageId) {
        throw new Error('Facebook page ID not found');
      }

      const pageAccessToken = await this.getPageAccessToken(
        decryptedAccessToken,
        targetPageId,
      );

      // Initialize video upload
      const initResponse = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${targetPageId}/videos`,
          null,
          {
            params: {
              access_token: pageAccessToken,
              upload_phase: 'start',
            },
          },
        ),
      );

      const uploadSessionId = initResponse.data.upload_session_id;
      const videoId = initResponse.data.video_id;

      // Download video data
      const videoData = await firstValueFrom(
        this.httpService.get(videoUrl, {
          responseType: 'arraybuffer',
        }),
      );

      // Upload video chunks (for simplicity, uploading as single chunk)
      await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${targetPageId}/videos`,
          videoData.data,
          {
            headers: {
              'Content-Type': 'application/octet-stream',
            },
            params: {
              access_token: pageAccessToken,
              start_offset: 0,
              upload_phase: 'transfer',
              upload_session_id: uploadSessionId,
            },
          },
        ),
      );

      // Finish upload and publish
      const finishResponse = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${targetPageId}/videos`,
          null,
          {
            params: {
              access_token: pageAccessToken,
              description,
              title,
              upload_phase: 'finish',
              upload_session_id: uploadSessionId,
            },
          },
        ),
      );

      this.loggerService.log(`${url} succeeded`, finishResponse.data);

      return videoId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async uploadVideoByUrl(
    organizationId: string,
    brandId: string,
    videoUrl: string,
    title: string,
    description: string,
    pageId?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(organizationId, brandId);

      if (!credential?.accessToken) {
        throw new Error('Facebook credential not found or invalid');
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      const targetPageId = pageId || credential.externalId;
      if (!targetPageId) {
        throw new Error('Facebook page ID not found');
      }

      const pageAccessToken = await this.getPageAccessToken(
        decryptedAccessToken,
        targetPageId,
      );

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${targetPageId}/videos`,
          null,
          {
            params: {
              access_token: pageAccessToken,
              description,
              file_url: videoUrl,
              title,
            },
          },
        ),
      );

      this.loggerService.log(`${url} succeeded`, response.data);

      return response.data.id;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async schedulePost(
    pageId: string,
    pageAccessToken: string,
    message: string,
    scheduledPublishTime: number,
    mediaUrl?: string,
    mediaType?: 'image' | 'video',
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const params: Record<string, string | number | boolean> = {
        access_token: pageAccessToken,
        message,
        published: false,
        scheduled_publish_time: scheduledPublishTime,
      };

      let endpoint = `${this.graphUrl}/${this.apiVersion}/${pageId}/feed`;

      if (mediaUrl && mediaType === 'image') {
        endpoint = `${this.graphUrl}/${this.apiVersion}/${pageId}/photos`;
        params.url = mediaUrl;
      } else if (mediaUrl && mediaType === 'video') {
        endpoint = `${this.graphUrl}/${this.apiVersion}/${pageId}/videos`;
        params.file_url = mediaUrl;
      }

      const response = await firstValueFrom(
        this.httpService.post(endpoint, null, { params }),
      );

      this.loggerService.log(`${url} succeeded`, response.data);

      return response.data.id;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Post a comment on a Facebook post
   * @param organizationId The organization ID
   * @param brandId The brand ID
   * @param postId The Facebook post ID
   * @param message The comment text
   * @returns The comment ID
   */
  public async postComment(
    organizationId: string,
    brandId: string,
    postId: string,
    message: string,
  ): Promise<{ commentId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(organizationId, brandId);

      if (!credential?.accessToken) {
        throw new Error('Facebook credential not found or invalid');
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      const targetPageId = credential.externalId;
      if (!targetPageId) {
        throw new Error('Facebook page ID not found');
      }

      const pageAccessToken = await this.getPageAccessToken(
        decryptedAccessToken,
        targetPageId,
      );

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${postId}/comments`,
          null,
          {
            params: {
              access_token: pageAccessToken,
              message,
            },
          },
        ),
      );

      this.loggerService.log(`${url} succeeded`, response.data);

      return { commentId: response.data.id };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async getPostAnalytics(
    postId: string,
    accessToken: string,
  ): Promise<{
    views: number;
    likes: number;
    comments: number;
    shares: number;
    reach?: number;
    impressions?: number;
    engagementRate?: number;
    reactions?: {
      like?: number;
      love?: number;
      wow?: number;
      haha?: number;
      sad?: number;
      angry?: number;
    };
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.graphUrl}/${this.apiVersion}/${postId}`, {
          params: {
            access_token: accessToken,
            fields:
              'reactions.summary(true),comments.summary(true),shares,insights.metric(post_impressions,post_engaged_users,post_clicks,post_video_views)',
          },
        }),
      );

      const data = response.data || {};
      const insights = data.insights?.data || [];

      // Extract insights metrics
      const getInsightValue = (metricName: string): number => {
        const insight = (insights as FacebookInsight[]).find(
          (i) => i.name === metricName,
        );
        return insight?.values?.[0]?.value || 0;
      };

      const impressions = getInsightValue('post_impressions');
      const engagedUsers = getInsightValue('post_engaged_users');
      // const clicks = getInsightValue('post_clicks');
      const videoViews = getInsightValue('post_video_views');

      // Calculate engagement rate
      const engagementRate =
        impressions > 0 ? (engagedUsers / impressions) * 100 : 0;

      // Extract reaction breakdown
      const reactions: Record<string, number> = {};
      if (data.reactions?.data) {
        (data.reactions.data as FacebookReaction[]).forEach((reaction) => {
          const type = reaction.type.toLowerCase();
          reactions[type] = (reactions[type] || 0) + 1;
        });
      }

      return {
        comments: data.comments?.summary?.total_count || 0,
        engagementRate:
          engagementRate > 0 ? Number(engagementRate.toFixed(2)) : undefined,
        impressions: impressions || undefined,
        likes: data.reactions?.summary?.total_count || 0,
        reach: engagedUsers || undefined,
        reactions: Object.keys(reactions).length > 0 ? reactions : undefined,
        shares: data.shares?.count || 0,
        views: videoViews || impressions || 0,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      return {
        comments: 0,
        likes: 0,
        shares: 0,
        views: 0,
      };
    }
  }

  public async deletePost(
    postId: string,
    accessToken: string,
  ): Promise<boolean> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      await firstValueFrom(
        this.httpService.delete(
          `${this.graphUrl}/${this.apiVersion}/${postId}`,
          {
            params: {
              access_token: accessToken,
            },
          },
        ),
      );

      this.loggerService.log(`${url} succeeded`);

      return true;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
