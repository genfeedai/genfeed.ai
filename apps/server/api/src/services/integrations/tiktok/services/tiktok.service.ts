import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import {
  CredentialPlatform,
  OAuthGrantType,
  TikTokPublishStatus,
} from '@genfeedai/enums';
import type {
  ISocialTrend,
  ITikTokCreatorInfo,
  ITikTokMediaAnalytics,
  ITikTokPublishResponse,
  ITikTokPublishStatusData,
  ITikTokVideo,
} from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

const TIKTOK_TOKEN_REFRESH_BUFFER_MS = 15 * 60 * 1000;

interface TikTokTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

@Injectable()
export class TiktokService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly endpoint = 'https://open.tiktokapis.com/v2';
  private readonly contentType = 'application/json; charset=UTF-8';
  private readonly apiKey: string;
  private readonly apiSecret: string;

  // Retry settings for polling TikTok publish status
  public readonly RETRY_MAX_ATTEMPTS = 30;
  public readonly RETRY_DELAY_MS = 5_000;

  // TikTok auth error codes that indicate credential needs re-authentication
  private readonly AUTH_ERROR_CODES = [
    'access_token_invalid',
    'invalid_grant',
    'invalid_refresh_token',
    'refresh_token_expired',
    'token_expired',
  ];

  // Common privacy level selection logic
  private readonly PREFERRED_PRIVACY_LEVEL = 'SELF_ONLY';

  constructor(
    private readonly configService: ConfigService,

    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.configService.get('TIKTOK_CLIENT_KEY') ?? '';
    this.apiSecret = this.configService.get('TIKTOK_CLIENT_SECRET') ?? '';
  }

  /**
   * Check if an error is an authentication error that requires re-authentication
   */
  private isAuthError(error: unknown): boolean {
    const axiosError = error as AxiosError<{
      error?: { code?: string } | string;
      data?: { error?: { code?: string } };
    }>;
    const response = axiosError?.response;
    const data = response?.data;
    const errorCode =
      (typeof data?.error === 'object' ? data?.error?.code : data?.error) ||
      data?.data?.error?.code;
    return (
      typeof errorCode === 'string' && this.AUTH_ERROR_CODES.includes(errorCode)
    );
  }

  /**
   * Get the error code from a TikTok API error
   */
  private getErrorCode(error: unknown): string | undefined {
    const axiosError = error as AxiosError<{
      error?: { code?: string } | string;
      data?: { error?: { code?: string } };
    }>;
    const response = axiosError?.response;
    const data = response?.data;
    const errorCode =
      (typeof data?.error === 'object' ? data?.error?.code : data?.error) ||
      data?.data?.error?.code;
    return typeof errorCode === 'string' ? errorCode : undefined;
  }

  /**
   * Handle auth error by marking credential as disconnected
   */
  private async handleAuthError(
    credentialId: string,
    errorCode: string | undefined,
    context: string,
  ): Promise<void> {
    try {
      await this.credentialsService.patch(credentialId, {
        isConnected: false,
      });
      this.loggerService.warn(
        `${context} - credential marked as disconnected due to auth error`,
        { credentialId: credentialId.toString(), errorCode },
      );
    } catch (patchError: unknown) {
      this.loggerService.error(
        `${context} - failed to mark credential as disconnected`,
        patchError,
      );
    }
  }

  private async findCredential(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<CredentialDocument | null> {
    return credentialId
      ? this.credentialsService.findOne({ _id: credentialId })
      : this.credentialsService.findOne({
          brand: brandId,
          organization: organizationId,
          platform: CredentialPlatform.TIKTOK,
        });
  }

  private shouldRefreshAccessToken(expiresAt?: Date | string | null): boolean {
    if (!expiresAt) {
      return true;
    }

    const expiresAtMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) {
      return true;
    }

    return expiresAtMs <= Date.now() + TIKTOK_TOKEN_REFRESH_BUFFER_MS;
  }

  public async getValidCredential(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<CredentialEntity> {
    const credential = await this.findCredential(
      organizationId,
      brandId,
      credentialId,
    );

    if (!credential) {
      throw new Error('TikTok credential not found');
    }

    if (
      !credential.accessToken ||
      this.shouldRefreshAccessToken(credential.accessTokenExpiry)
    ) {
      return this.refreshToken(organizationId, brandId, credentialId);
    }

    return new CredentialEntity({
      ...credential,
      oauthTokenHash: credential.oauthTokenHash ?? '',
    });
  }

  /**
   * Select privacy level from available options
   */
  private selectPrivacyLevel(availablePrivacyLevels: string[]): string {
    return availablePrivacyLevels.includes(this.PREFERRED_PRIVACY_LEVEL)
      ? this.PREFERRED_PRIVACY_LEVEL
      : availablePrivacyLevels[0];
  }

  /**
   * Validate creator info and privacy levels
   */
  private validateCreatorInfo(
    creatorInfo: ITikTokCreatorInfo,
    context: string,
  ): {
    privacyLevel: string;
    disableOptions: { comment: boolean; duet: boolean; stitch: boolean };
  } {
    const availablePrivacyLevels = creatorInfo.privacy_level_options || [];

    if (availablePrivacyLevels.length === 0) {
      this.loggerService.error(
        `${context} failed - no privacy levels available from TikTok API`,
        { creatorInfo },
      );
      throw new Error(
        'TikTok API returned no available privacy levels. This may be due to API issues or account restrictions.',
      );
    }

    const privacyLevel = this.selectPrivacyLevel(availablePrivacyLevels);
    this.loggerService.log(`${context} using privacy_level: ${privacyLevel}`, {
      available: availablePrivacyLevels,
    });

    return {
      disableOptions: {
        comment: creatorInfo.comment_disabled || false,
        duet: creatorInfo.duet_disabled || false,
        stitch: creatorInfo.stitch_disabled || false,
      },
      privacyLevel,
    };
  }

  /**
   * Process publish response and poll for status
   */
  private async processPublishResponse(
    res: { status: number; data: ITikTokPublishResponse },
    decryptedAccessToken: string,
    context: string,
    mediaType: 'video' | 'image',
  ): Promise<ITikTokPublishResponse> {
    if (res.status !== 200) {
      this.loggerService.error(`${context} failed`, res.data);
      throw new Error('TikTok API returned non-200 status');
    }

    const publishId = res.data?.data?.publish_id;

    if (!publishId) {
      this.loggerService.error(
        `${context} no publish_id in response`,
        res.data,
      );
      throw new Error('TikTok upload failed: no publish_id returned');
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));

    const statusData = await this.getPublishStatus(
      decryptedAccessToken,
      publishId,
      this.RETRY_MAX_ATTEMPTS,
      this.RETRY_DELAY_MS,
    );

    if (statusData?.publicly_available_post_id?.[0]) {
      this.loggerService.log(
        `${context} success - got post_id: ${statusData.publicly_available_post_id[0]}`,
      );
      return {
        ...res.data,
        data: {
          ...res.data.data,
          isPending: false,
          post_id: statusData.publicly_available_post_id[0],
          publish_id: publishId,
          status: statusData.status,
        },
      };
    }

    // Post submitted but still in TikTok moderation queue
    this.loggerService.log(
      `${context} ${mediaType} submitted, awaiting TikTok moderation - marking as PENDING`,
      { publishId, status: statusData?.status },
    );
    return {
      ...res.data,
      data: {
        ...res.data.data,
        isPending: true,
        post_id: undefined,
        publish_id: publishId,
        status: statusData?.status || 'PROCESSING_UPLOAD',
      },
    };
  }

  public async refreshToken(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<CredentialEntity> {
    const url = 'TiktokService refreshToken';
    this.loggerService.log(`${url} started`);

    try {
      const credential = await this.findCredential(
        organizationId,
        brandId,
        credentialId,
      );

      if (!credential?.refreshToken) {
        throw new Error('No refresh token available');
      }

      // Decrypt the refresh token before use
      const decryptedRefreshToken = EncryptionUtil.decrypt(
        credential.refreshToken,
      );

      const data = new URLSearchParams({
        client_key: this.apiKey,
        client_secret: this.apiSecret,
        grant_type: OAuthGrantType.REFRESH_TOKEN,
        refresh_token: decryptedRefreshToken,
      });

      const tokenRes = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/oauth/token/`,
          data.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      const {
        access_token,
        expires_in,
        refresh_expires_in,
        refresh_token,
        refresh_token_expires_in,
      } = (tokenRes.data || {}) as TikTokTokenResponse;
      const refreshExpiresIn = refresh_expires_in ?? refresh_token_expires_in;

      if (!access_token) {
        throw new Error('TikTok refresh response missing access token');
      }

      const updatedCredential = await this.credentialsService.patch(
        credential.id,
        {
          accessToken: access_token,
          accessTokenExpiry: expires_in
            ? new Date(Date.now() + expires_in * 1000)
            : undefined,
          isConnected: true,
          refreshToken: refresh_token,
          refreshTokenExpiry: refreshExpiresIn
            ? new Date(Date.now() + refreshExpiresIn * 1000)
            : undefined,
        },
      );

      this.loggerService.log(`${url} success`);
      return new CredentialEntity({
        ...updatedCredential,
        oauthTokenHash: updatedCredential.oauthTokenHash ?? '',
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      // If auth error, mark credential as disconnected
      if (this.isAuthError(error)) {
        const credential = await this.findCredential(
          organizationId,
          brandId,
          credentialId,
        );
        if (credential) {
          await this.handleAuthError(
            credential.id,
            this.getErrorCode(error),
            url,
          );
        }
      }

      throw error;
    }
  }

  public async getTrends(
    organizationId?: string,
    brandId?: string,
  ): Promise<ISocialTrend[]> {
    const url = `${this.constructorName} getTrends organizationId: ${organizationId} brandId: ${brandId}`;

    try {
      const trendingHashtags: ISocialTrend[] = [];

      if (!organizationId || !brandId) {
        this.loggerService.warn(`${url} - TikTok trend provider unavailable`, {
          reason: 'missing_organization_or_brand_scope',
        });
      } else {
        let credential: CredentialEntity | null = null;
        try {
          credential = await this.getValidCredential(organizationId, brandId);

          if (credential?.accessToken) {
            // Decrypt the access token
            const decryptedAccessToken = EncryptionUtil.decrypt(
              credential.accessToken,
            );

            // Fetch user's trending content
            const userTrends = await firstValueFrom(
              this.httpService.get(`${this.endpoint}/video/list/`, {
                headers: {
                  Authorization: `Bearer ${decryptedAccessToken}`,
                  'Content-Type': this.contentType,
                },
                params: {
                  fields: 'id,title,create_time,statistics',
                  max_count: 10,
                },
              }),
            );

            if (userTrends.data?.data?.videos) {
              trendingHashtags.push(
                ...userTrends.data.data.videos.map((video: ITikTokVideo) => ({
                  growthRate: 0,
                  mentions: video.statistics?.view_count || 0,
                  metadata: {
                    createdAt: video.create_time,
                    videoId: video.id,
                  },
                  topic: `#${video.title}`,
                })),
              );
            }
          } else {
            this.loggerService.warn(
              `${url} - TikTok trend provider unavailable`,
              {
                brandId,
                hasCredential: Boolean(credential),
                organizationId,
                reason: 'missing_tiktok_credential',
              },
            );
          }
        } catch (error: unknown) {
          this.loggerService.warn(
            `${url} - Could not fetch personalized trends`,
            error,
          );

          // If auth error, mark credential as disconnected
          if (this.isAuthError(error) && credential) {
            await this.handleAuthError(
              credential.id,
              this.getErrorCode(error),
              url,
            );
          }
        }
      }

      return trendingHashtags;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async getTiktokInfo(
    organizationId: string,
    brandId: string,
    accessToken?: string,
  ): Promise<{
    avatarUrl?: string;
    displayName?: string;
    followerCount?: number;
    followingCount?: number;
    isConnected: boolean;
    likesCount?: number;
    platform: CredentialPlatform;
    userId?: string;
    username?: string;
    videoCount?: number;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    let credential: CredentialDocument | CredentialEntity | null = null;

    try {
      let decryptedAccessToken: string;

      // Use provided access token (from verify flow) or fetch from DB
      if (accessToken) {
        decryptedAccessToken = EncryptionUtil.decrypt(accessToken);
      } else {
        credential = await this.getValidCredential(organizationId, brandId);

        if (!credential.accessToken) {
          throw new Error('TikTok credential not found or invalid');
        }

        decryptedAccessToken = EncryptionUtil.decrypt(credential.accessToken);
      }

      // Get user info from TikTok API
      const userInfoRes = await firstValueFrom(
        this.httpService.get(`${this.endpoint}/user/info/`, {
          headers: {
            Authorization: `Bearer ${decryptedAccessToken}`,
            'Content-Type': this.contentType,
          },
          params: {
            fields:
              'open_id,union_id,avatar_url,display_name,username,follower_count,following_count,likes_count,video_count',
          },
        }),
      );

      const userInfo = userInfoRes.data?.data?.user || {};

      this.loggerService.log(`${url} success`);
      return {
        avatarUrl: userInfo.avatar_url,
        displayName: userInfo.display_name,
        followerCount: userInfo.follower_count,
        followingCount: userInfo.following_count,
        isConnected: true, // Always true when we can fetch user info
        likesCount: userInfo.likes_count,
        platform: CredentialPlatform.TIKTOK,
        userId: userInfo.open_id,
        username: userInfo.username,
        videoCount: userInfo.video_count,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      // If auth error and we have a credential, mark it as disconnected
      if (this.isAuthError(error) && credential) {
        await this.handleAuthError(
          credential.id,
          this.getErrorCode(error),
          url,
        );
      }

      throw error;
    }
  }

  /**
   * Query creator info to get available privacy levels and posting capabilities
   * REQUIRED before posting - TikTok API mandate
   * @see https://developers.tiktok.com/doc/content-posting-api-get-started
   */
  public async getCreatorInfo(accessToken: string): Promise<{
    creator_avatar_url: string;
    creator_username: string;
    creator_nickname: string;
    privacy_level_options: string[];
    comment_disabled: boolean;
    duet_disabled: boolean;
    stitch_disabled: boolean;
    max_video_post_duration_sec: number;
  }> {
    const url = `${this.constructorName} getCreatorInfo`;

    try {
      const res = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/post/publish/creator_info/query/`,
          {},
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': this.contentType,
            },
          },
        ),
      );

      const creatorInfo = res.data?.data || {};
      this.loggerService.log(`${url} success`, {
        max_video_post_duration_sec: creatorInfo.max_video_post_duration_sec,
        privacy_level_options: creatorInfo.privacy_level_options,
      });

      return creatorInfo;
    } catch (error: unknown) {
      const axiosError = error as AxiosError;
      this.loggerService.error(
        `${url} failed`,
        axiosError?.response?.data || error,
      );
      throw error;
    }
  }

  public async uploadVideo(
    organizationId: string,
    brandId: string,
    videoUrl: string,
    post: PostEntity,
  ): Promise<ITikTokPublishResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      this.loggerService.log(`${url} started`, { videoUrl });

      const credential = await this.getValidCredential(organizationId, brandId);

      if (!credential?.accessToken) {
        throw new Error('TikTok credential not found or invalid');
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );
      const creatorInfo = await this.getCreatorInfo(decryptedAccessToken);
      const { privacyLevel, disableOptions } = this.validateCreatorInfo(
        creatorInfo,
        url,
      );

      const description =
        htmlToText(post.description) || 'Check out this video! #fyp';

      const res = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/post/publish/video/init/`,
          {
            post_info: {
              description,
              disable_comment: disableOptions.comment,
              disable_duet: disableOptions.duet,
              disable_stitch: disableOptions.stitch,
              privacy_level: privacyLevel,
              title: post.label || 'Check out this video!',
            },
            source_info: {
              source: 'PULL_FROM_URL',
              video_url: videoUrl,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${decryptedAccessToken}`,
              'Content-Type': this.contentType,
            },
          },
        ),
      );

      return this.processPublishResponse(
        res,
        decryptedAccessToken,
        url,
        'video',
      );
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async uploadImage(
    organizationId: string,
    brandId: string,
    imageUrls: string[],
    post: PostEntity,
    draftMode = false,
  ): Promise<ITikTokPublishResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      this.loggerService.log(`${url} started`, {
        imageCount: imageUrls.length,
      });

      if (!imageUrls || imageUrls.length === 0) {
        throw new Error('At least one image URL is required');
      }

      if (imageUrls.length > 35) {
        throw new Error('Maximum 35 images allowed per post');
      }

      const credential = await this.getValidCredential(organizationId, brandId);

      if (!credential?.accessToken) {
        throw new Error('TikTok credential not found or invalid');
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );
      const creatorInfo = await this.getCreatorInfo(decryptedAccessToken);
      const { privacyLevel, disableOptions } = this.validateCreatorInfo(
        creatorInfo,
        url,
      );

      const description =
        htmlToText(post.description) ||
        'this will be a #funny photo on your @tiktok #fyp';

      const res = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/post/publish/content/init/`,
          {
            media_type: 'PHOTO',
            post_info: {
              auto_add_music: true,
              description,
              disable_comment: disableOptions.comment,
              privacy_level: privacyLevel,
              title: post.label || 'Check out this photo!',
            },
            post_mode: draftMode ? 'MEDIA_UPLOAD' : 'DIRECT_POST',
            source_info: {
              photo_cover_index: 0,
              photo_images: imageUrls,
              source: 'PULL_FROM_URL',
            },
          },
          {
            headers: {
              Authorization: `Bearer ${decryptedAccessToken}`,
              'Content-Type': this.contentType,
            },
          },
        ),
      );

      return this.processPublishResponse(
        res,
        decryptedAccessToken,
        url,
        'image',
      );
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Get the publish status and publicly available post ID
   * @param accessToken The access token
   * @param publishId The publish ID from the upload response
   * @returns Status data including publicly_available_post_id
   */
  public async getPublishStatus(
    accessToken: string,
    publishId: string,
    maxAttempts: number = this.RETRY_MAX_ATTEMPTS,
    delayMs: number = this.RETRY_DELAY_MS,
  ): Promise<ITikTokPublishStatusData | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const res = await firstValueFrom(
          this.httpService.post(
            `${this.endpoint}/post/publish/status/fetch/`,
            {
              publish_id: publishId,
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': this.contentType,
              },
            },
          ),
        );

        const data = res.data?.data || {};
        this.loggerService.log(`${url} attempt ${attempt + 1}`, {
          publicly_available_post_id: data.publicly_available_post_id,
          status: data.status,
        });

        // Check if the post is published and has a publicly available ID
        if (
          data.status === TikTokPublishStatus.PUBLISH_COMPLETE &&
          data.publicly_available_post_id?.length > 0
        ) {
          return data;
        }

        // If failed, throw error
        if (data.status === TikTokPublishStatus.FAILED) {
          throw new Error(
            `TikTok publish failed: ${data.fail_reason || 'Unknown reason'}`,
          );
        }

        // Wait before next attempt if still processing
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      // If we've exhausted all attempts without getting post_id, log final attempt
      const finalRes = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/post/publish/status/fetch/`,
          {
            publish_id: publishId,
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': this.contentType,
            },
          },
        ),
      );

      this.loggerService.warn(
        `${url} max attempts (${maxAttempts}) reached without getting publicly_available_post_id`,
        {
          finalStatus: finalRes.data?.data?.status,
          fullResponse: finalRes.data,
        },
      );
      return finalRes.data?.data || null;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Get analytics for TikTok media (videos and photos)
   * @param organizationId The organization ID
   * @param brandId The brand ID
   * @param mediaId The TikTok media ID (video or photo)
   * @returns Analytics data including views, likes, comments, shares, downloads
   */
  public async getMediaAnalytics(
    organizationId: string,
    brandId: string,
    mediaId: string,
  ): Promise<ITikTokMediaAnalytics> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    let credential: CredentialDocument | CredentialEntity | null = null;

    try {
      credential = await this.getValidCredential(organizationId, brandId);

      if (!credential.accessToken) {
        throw new Error('TikTok credential not found');
      }

      // Decrypt the access token
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      // Fetch comprehensive media metrics
      const res = await firstValueFrom(
        this.httpService.get(`${this.endpoint}/video/query/`, {
          headers: { Authorization: `Bearer ${decryptedAccessToken}` },
          params: {
            fields:
              'like_count,comment_count,view_count,share_count,download_count,reach_count,impression_count,full_video_watched_rate,average_watch_time,total_time_watched',
            video_ids: mediaId,
          },
        }),
      );

      const item = res.data?.data?.videos?.[0] || {};

      // Calculate engagement rate
      const totalEngagements =
        (item.like_count || 0) +
        (item.comment_count || 0) +
        (item.share_count || 0) +
        (item.download_count || 0);

      const engagementRate =
        item.view_count > 0 ? (totalEngagements / item.view_count) * 100 : 0;

      return {
        averageWatchTime: item.average_watch_time || undefined,
        comments: item.comment_count || 0,
        completionRate: item.full_video_watched_rate
          ? Number((item.full_video_watched_rate * 100).toFixed(2))
          : undefined,
        downloads: item.download_count || undefined,
        engagementRate:
          engagementRate > 0 ? Number(engagementRate.toFixed(2)) : undefined,
        impressions: item.impression_count || undefined,
        likes: item.like_count || 0,
        mediaType: 'video', // Default to video as API doesn't distinguish between video/photo
        reach: item.reach_count || undefined,
        shares: item.share_count || undefined,
        views: item.view_count || 0,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      // If auth error and we have a credential, mark it as disconnected
      if (this.isAuthError(error) && credential) {
        await this.handleAuthError(
          credential.id,
          this.getErrorCode(error),
          url,
        );
      }

      throw error;
    }
  }
}
