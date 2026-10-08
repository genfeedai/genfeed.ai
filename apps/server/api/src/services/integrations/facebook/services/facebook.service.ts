import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import {
  readMetaPages,
  resolveMetaPageAccess,
} from '@api/services/integrations/_shared/meta-page-access.util';
import {
  type FacebookAnalyticsResult,
  failedFacebookAnalytics,
  parseFacebookAnalytics,
} from '@api/services/integrations/facebook/utils/facebook-analytics.util';
import { isUnconfiguredSecret } from '@genfeedai/config';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/contracts';
import {
  buildGrantedScopesCredentialPatch,
  readOAuthTokenScopeField,
} from '@genfeedai/helpers';
import {
  FACEBOOK_OAUTH_SCOPES,
  META_GRAPH_API_VERSION,
  META_GRAPH_URL,
} from '@genfeedai/integrations';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

interface FacebookPermission {
  permission?: unknown;
  status?: unknown;
}

@Injectable()
export class FacebookService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly graphUrl: string = META_GRAPH_URL;
  private readonly apiVersion: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {
    this.apiVersion =
      this.configService.get('FACEBOOK_API_VERSION') || META_GRAPH_API_VERSION;
  }

  private requireString(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${label} is required`);
    }

    return value;
  }

  /**
   * Get page access token for a specific page
   */
  private async getPageAccessToken(
    userAccessToken: string,
    pageId: string,
  ): Promise<string> {
    const page = await resolveMetaPageAccess(
      this.httpService,
      `${this.graphUrl}/${this.apiVersion}`,
      userAccessToken,
      { pageId },
    );
    return page.accessToken;
  }

  public generateAuthUrl(state: string): string {
    const clientId = this.configService.get('FACEBOOK_APP_ID');
    const redirectUri = this.configService.get('FACEBOOK_REDIRECT_URI');
    if (
      !clientId ||
      !redirectUri ||
      isUnconfiguredSecret(clientId) ||
      isUnconfiguredSecret(redirectUri)
    ) {
      throw new ServiceUnavailableException(
        'Facebook OAuth is not configured for this deployment.',
      );
    }
    // Organic publishing + Meta Marketing API (Meta Ads reuses this token).
    const scope = FACEBOOK_OAUTH_SCOPES.join(',');

    return `https://www.facebook.com/${this.apiVersion}/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
  }

  public async exchangeAuthCodeForAccessToken(code: string): Promise<{
    accessToken: string;
    expiresIn: number;
    scope?: unknown;
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

      const scope = readOAuthTokenScopeField(response.data);

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
        ...(scope === undefined ? {} : { scope }),
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
    picture?: { data?: { url?: string } };
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.graphUrl}/${this.apiVersion}/me`, {
          params: {
            access_token: accessToken,
            fields: 'id,name,email,picture.width(256).height(256)',
          },
        }),
      );

      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async getGrantedPermissions(
    accessToken: string,
  ): Promise<string[] | undefined> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.graphUrl}/${this.apiVersion}/me/permissions`,
          { params: { access_token: accessToken } },
        ),
      );
      const permissions = Array.isArray(response.data?.data)
        ? (response.data.data as FacebookPermission[])
        : undefined;
      if (!permissions) return undefined;
      return [
        ...new Set(
          permissions.flatMap((permission) =>
            permission.status === 'granted' &&
            typeof permission.permission === 'string'
              ? [permission.permission]
              : [],
          ),
        ),
      ].sort();
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * @param credentialId - which Facebook account to refresh. Required whenever
   *   the caller knows it: a brand may hold several Facebook accounts, and
   *   without an id this repairs the brand's oldest one.
   */
  public async refreshToken(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<Record<string, unknown>> {
    const credentials = await this.credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      // A failed refresh flips isConnected off; the retry still has to find it.
      isDisconnectedIncluded: true,
      organizationId,
      platform: CredentialPlatform.FACEBOOK,
    });

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

        const responseScope = readOAuthTokenScopeField(response.data);
        let grantedScopes = responseScope;
        if (responseScope === undefined || responseScope === null) {
          try {
            grantedScopes = await this.getGrantedPermissions(access_token);
          } catch (permissionError: unknown) {
            this.loggerService.warn(
              'Facebook permission capture failed after token refresh',
              permissionError,
            );
          }
        }

        return await this.credentialsService.patch(credentials.id, {
          accessToken: access_token,
          accessTokenExpiry: expires_in
            ? new Date(Date.now() + expires_in * 1000)
            : undefined,
          isConnected: true,
          isDeleted: false,
          ...buildGrantedScopesCredentialPatch(grantedScopes),
        });
      }

      return credentials;
    } catch (error: unknown) {
      this.loggerService.error('Refresh token failed', error);
      // Mark credential as disconnected if refresh fails
      await this.credentialsService.patch(credentials.id, {
        isConnected: false,
      });
      throw error;
    }
  }

  /**
   * @param credentialId - which Facebook account's pages to list. Two Facebook
   *   accounts on one brand expose different page sets; without an id this
   *   answers for the brand's oldest account.
   */
  public async getUserPages(
    organizationId: string,
    brandId: string,
    credentialId?: string,
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
      const credential = await this.credentialsService.resolveBrandAccount({
        brandId,
        credentialId,
        organizationId,
        platform: CredentialPlatform.FACEBOOK,
      });

      if (!credential) {
        throw new Error('Facebook credential not found');
      }

      // Decrypt the access token
      const decryptedAccessToken = EncryptionUtil.decrypt(
        this.requireString(credential.accessToken, 'Facebook access token'),
      );

      const pages = await readMetaPages(
        this.httpService,
        `${this.graphUrl}/${this.apiVersion}`,
        decryptedAccessToken,
      );

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

      return this.requireString(
        response.data?.post_id,
        'Facebook photo post ID',
      );
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async uploadVideo(
    pageId: string,
    pageAccessToken: string,
    videoUrl: string,
    title: string,
    description: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${pageId}/videos`,
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

      return this.requireString(response.data?.id, 'Facebook video ID');
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
   * @param credentialId Which Facebook account comments; the brand's oldest
   *   account is used when the caller cannot name one
   * @param options.attachmentUrl Publicly reachable image URL attached to the
   *   comment. Graph comments take a photo this way; video attachments are not
   *   part of the comment API, so callers drop them upstream.
   * @returns The comment ID
   */
  public async postComment(
    organizationId: string,
    brandId: string,
    postId: string,
    message: string,
    credentialId?: string,
    options: { attachmentUrl?: string } = {},
  ): Promise<{ commentId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(
        organizationId,
        brandId,
        credentialId,
      );

      if (!credential?.accessToken) {
        throw new Error('Facebook credential not found or invalid');
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        this.requireString(credential.accessToken, 'Facebook access token'),
      );

      const targetPageId = this.requireString(
        credential.externalId,
        'Facebook page ID',
      );
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
              ...(options.attachmentUrl
                ? { attachment_url: options.attachmentUrl }
                : {}),
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
    pageId?: string,
    isVideo = false,
  ): Promise<FacebookAnalyticsResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const pageAccessToken = pageId
        ? await this.getPageAccessToken(accessToken, pageId)
        : accessToken;
      const response = await firstValueFrom(
        this.httpService.get(`${this.graphUrl}/${this.apiVersion}/${postId}`, {
          params: {
            access_token: pageAccessToken,
            fields: isVideo
              ? 'likes.summary(true),comments.summary(true),video_insights.metric(total_video_views)'
              : 'reactions.summary(true),comments.summary(true),shares,insights.metric(post_media_view)',
          },
        }),
      );
      return parseFacebookAnalytics(response.data, postId, isVideo);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      return failedFacebookAnalytics(error, isVideo);
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
