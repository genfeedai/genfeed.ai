import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import {
  getTikTokErrorCode,
  isTikTokAuthorizationError,
  parseTikTokGrantedScopes,
} from '@api/services/integrations/tiktok/utils/tiktok-error.util';
import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import {
  CredentialPlatform,
  OAuthGrantType,
  TikTokPublishStatus,
} from '@genfeedai/contracts';
import {
  type ChannelTargetSettings,
  readChannelSettingBoolean,
  readChannelSettingString,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  ISocialTrend,
  ITikTokCreatorInfo,
  ITikTokMediaAnalytics,
  ITikTokPublishResponse,
  ITikTokPublishStatusData,
  ITikTokVideo,
} from '@genfeedai/contracts/interfaces';
import { buildGrantedScopesCredentialPatch } from '@genfeedai/helpers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import type { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { TiktokAnalyticsService } from './tiktok-analytics.service';
import { resolveTikTokPrivacyLevel } from './tiktok-publishing.mapper';

const TIKTOK_TOKEN_REFRESH_BUFFER_MS = 15 * 60 * 1000;

interface TikTokTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

export interface TikTokPublishPost {
  description: string | null | undefined;
  label: string | null | undefined;
}

function normalizeCredential(
  credential: CredentialDocument,
): CredentialDocument {
  return {
    ...credential,
    oauthTokenHash: credential.oauthTokenHash ?? '',
  };
}

@Injectable()
export class TiktokService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly endpoint = 'https://open.tiktokapis.com/v2';
  private readonly contentType = 'application/json; charset=UTF-8';
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly analyticsService: TiktokAnalyticsService;

  // Retry settings for polling TikTok publish status
  public readonly RETRY_MAX_ATTEMPTS = 30;
  public readonly RETRY_DELAY_MS = 5_000;

  constructor(
    private readonly configService: ConfigService,

    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.configService.get('TIKTOK_CLIENT_KEY') ?? '';
    this.apiSecret = this.configService.get('TIKTOK_CLIENT_SECRET') ?? '';
    this.analyticsService = new TiktokAnalyticsService(
      this.httpService,
      this.loggerService,
      this.endpoint,
      (organizationId, brandId, credentialId) =>
        this.getValidCredential(organizationId, brandId, credentialId),
      (resolvedCredentialId, error, context) =>
        this.handleAuthorizationError(resolvedCredentialId, error, context),
    );
  }

  /**
   * Check if an error is an authentication error that requires re-authentication
   */
  private isAuthError(error: unknown): boolean {
    return isTikTokAuthorizationError(error);
  }

  /**
   * Get the error code from a TikTok API error
   */
  private getErrorCode(error: unknown): string | undefined {
    return getTikTokErrorCode(error);
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

  /**
   * Reuse the integration's reconnect lifecycle from auxiliary TikTok reads.
   * Returns false for permission, rate-limit, and provider errors so callers
   * can preserve those states without disconnecting a valid credential.
   */
  public async handleAuthorizationError(
    credentialId: string,
    error: unknown,
    context: string,
  ): Promise<boolean> {
    if (!this.isAuthError(error)) {
      return false;
    }

    await this.handleAuthError(credentialId, this.getErrorCode(error), context);
    return true;
  }

  /**
   * Resolve the TikTok account this call acts as.
   *
   * `credentialId` names the account explicitly — that is the shape every
   * publish path uses, because a brand may hold several TikTok accounts and the
   * post already knows which one it belongs to. Without one the brand's default
   * account answers, and the resolver logs the ambiguity.
   */
  private async findCredential(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<CredentialDocument | null> {
    return this.credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      // Token repair runs through here; a lapsed account still has to be found.
      isDisconnectedIncluded: true,
      organizationId,
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
  ): Promise<CredentialDocument> {
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

    return normalizeCredential(credential);
  }

  /**
   * Validate creator info and privacy levels
   */
  private validateCreatorInfo(
    creatorInfo: ITikTokCreatorInfo,
    context: string,
    settings: ChannelTargetSettings = {},
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

    const requestedPrivacy = readChannelSettingString(settings, 'privacyLevel');
    const privacyLevel = resolveTikTokPrivacyLevel(
      availablePrivacyLevels,
      requestedPrivacy,
    );
    this.loggerService.log(`${context} using privacy_level: ${privacyLevel}`, {
      available: availablePrivacyLevels,
      requestedPrivacy,
    });

    return {
      // Account-level restrictions are a ceiling, not a default: when TikTok
      // reports an interaction as disabled for this creator it stays disabled
      // however the composer set it.
      disableOptions: {
        comment: this.resolveDisabled(
          creatorInfo.comment_disabled,
          settings,
          'allowComments',
        ),
        duet: this.resolveDisabled(
          creatorInfo.duet_disabled,
          settings,
          'allowDuet',
        ),
        stitch: this.resolveDisabled(
          creatorInfo.stitch_disabled,
          settings,
          'allowStitch',
        ),
      },
      privacyLevel,
    };
  }

  private resolveDisabled(
    accountDisabled: boolean | undefined,
    settings: ChannelTargetSettings,
    key: string,
  ): boolean {
    if (accountDisabled) {
      return true;
    }

    const allowed = readChannelSettingBoolean(settings, key);
    return allowed === undefined ? false : !allowed;
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
  ): Promise<CredentialDocument> {
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
        scope,
      } = (tokenRes.data || {}) as TikTokTokenResponse;
      const refreshExpiresIn = refresh_expires_in ?? refresh_token_expires_in;
      const grantedScopes = scope ? parseTikTokGrantedScopes(scope) : undefined;

      if (!access_token) {
        throw new Error('TikTok refresh response missing access token');
      }

      if (grantedScopes) {
        // Atomic per-key merge: replacing the whole warmupSignals object from
        // a stale read would erase evidence written by concurrent warmup
        // writers (authorized-signal snapshots, account-health assessments).
        await this.credentialsService.mergeWarmupSignals(
          credential.id,
          credential.organizationId ?? organizationId,
          {
            tiktokAuthorization: {
              grantedScopes,
              observedAt: new Date().toISOString(),
            },
          },
        );
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
          ...buildGrantedScopesCredentialPatch(scope),
        },
      );

      this.loggerService.log(`${url} success`);
      return normalizeCredential(updatedCredential);
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
        let credential: CredentialDocument | null = null;
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
    grantedScopes?: readonly string[] | string,
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

    let credential: CredentialDocument | null = null;

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

      const exactScopes = grantedScopes
        ? parseTikTokGrantedScopes(grantedScopes)
        : undefined;
      const fields = [
        ...(exactScopes === undefined || exactScopes.includes('user.info.basic')
          ? ['open_id', 'union_id', 'avatar_url', 'display_name']
          : []),
        ...(exactScopes === undefined ||
        exactScopes.includes('user.info.profile')
          ? ['username']
          : []),
        ...(exactScopes === undefined || exactScopes.includes('user.info.stats')
          ? ['follower_count', 'following_count', 'likes_count', 'video_count']
          : []),
      ];

      // TikTok rejects `fields=` outright, so with no user.info scope granted
      // (including an explicitly empty grant) return the deterministic empty
      // profile instead of issuing a request that can only fail.
      if (fields.length === 0) {
        this.loggerService.warn(
          `${url} skipped user info request - no user.info scope granted`,
          { grantedScopes: exactScopes },
        );
        return {
          isConnected: true,
          platform: CredentialPlatform.TIKTOK,
        };
      }

      // Request only fields backed by the exact scopes returned by OAuth.
      const userInfoRes = await firstValueFrom(
        this.httpService.get(`${this.endpoint}/user/info/`, {
          headers: {
            Authorization: `Bearer ${decryptedAccessToken}`,
            'Content-Type': this.contentType,
          },
          params: {
            fields: fields.join(','),
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

  /**
   * @param credentialId - which connected TikTok account publishes this. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async uploadVideo(
    organizationId: string,
    brandId: string,
    videoUrl: string,
    post: TikTokPublishPost,
    settings: ChannelTargetSettings = {},
    credentialId?: string,
  ): Promise<ITikTokPublishResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      this.loggerService.log(`${url} started`, { videoUrl });

      const credential = await this.getValidCredential(
        organizationId,
        brandId,
        credentialId,
      );

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
        settings,
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

  /**
   * Upload a video to the creator's TikTok Inbox so they can add a licensed
   * TikTok sound or make final native edits before posting. This endpoint does
   * not publish the video, so it deliberately does not poll for a public post.
   */
  public async uploadVideoToInbox(
    organizationId: string,
    brandId: string,
    videoUrl: string,
    credentialId?: string,
  ): Promise<ITikTokPublishResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`, { videoUrl });
      const credential = await this.getValidCredential(
        organizationId,
        brandId,
        credentialId,
      );
      if (!credential.accessToken) {
        throw new Error('TikTok credential not found or invalid');
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/post/publish/inbox/video/init/`,
          {
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

      if (response.status !== 200) {
        throw new Error('TikTok API returned non-200 status');
      }

      const publishId = response.data?.data?.publish_id;
      if (!publishId) {
        throw new Error('TikTok app upload failed: no publish_id returned');
      }

      this.loggerService.log(`${url} sent video to TikTok Inbox`, {
        publishId,
      });
      return response.data as ITikTokPublishResponse;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * @param credentialId - which connected TikTok account publishes this carousel.
   */
  public async uploadImage(
    organizationId: string,
    brandId: string,
    imageUrls: string[],
    post: TikTokPublishPost,
    draftMode = false,
    settings: ChannelTargetSettings = {},
    credentialId?: string,
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

      const credential = await this.getValidCredential(
        organizationId,
        brandId,
        credentialId,
      );

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
        settings,
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
    credentialId: string,
  ): Promise<ITikTokMediaAnalytics> {
    return this.analyticsService.getMediaAnalytics(
      organizationId,
      brandId,
      mediaId,
      credentialId,
    );
  }
}
