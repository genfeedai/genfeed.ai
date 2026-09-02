import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import type {
  ServerLinkedInTrend,
  ServerLinkedInTrendResolver,
} from '@api/services/integrations/linkedin/linkedin-trends.port';
import {
  LINKEDIN_DM_NOT_IMPLEMENTED_REASON,
  LINKEDIN_DM_UNAVAILABLE_REASON,
} from '@api/services/integrations/linkedin/services/linkedin-inbox.constants';
import { getSafeLinkedInOAuthErrorLog } from '@api/services/integrations/linkedin/utils/linkedin-oauth-error.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import {
  type ChannelTargetSettings,
  readChannelSettingString,
} from '@genfeedai/contracts/api-types/contracts';
import {
  buildGrantedScopesCredentialPatch,
  readOAuthTokenScopeField,
} from '@genfeedai/helpers';
import {
  getIntegrationProviderDefinition,
  IntegrationHttpClient,
} from '@genfeedai/integrations';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AuthClient } from 'linkedin-api-client';
import { firstValueFrom } from 'rxjs';
import {
  LinkedInAnalyticsService,
  type LinkedInMediaAnalytics,
} from './linkedin-analytics.service';

interface LinkedInCredential {
  id: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  grantedScopes?: string[] | null;
}

export type LinkedInInboxComment = {
  commentId: string;
  threadId: string;
  text: string;
  createdAt: Date;
  authorExternalId?: string;
  authorName?: string;
};

export type LinkedInInboxDmThread = {
  conversationId: string;
  participantExternalId?: string;
  participantName?: string;
  messages: Array<{
    messageId: string;
    text: string;
    createdAt: Date;
    senderExternalId?: string;
    senderName?: string;
  }>;
};

export type LinkedInDirectMessageListing = {
  isImplemented?: boolean;
  isPermitted: boolean;
  reason?: string;
  threads: LinkedInInboxDmThread[];
};

const LINKEDIN_MESSAGING_SCOPES = new Set([
  'r_member_mailbox',
  'r_messages',
  'w_member_mailbox',
]);

type LinkedInCommentElement = {
  $URN?: string;
  id?: string;
  actor?: string;
  created?: { time?: number };
  message?: { text?: string };
  parentComment?: string;
};

type LinkedInCommentsResponse = {
  elements?: LinkedInCommentElement[];
};

const LINKEDIN_PROVIDER = getIntegrationProviderDefinition('linkedin');

/**
 * LinkedIn's member-network visibility for this release.
 *
 * `PUBLIC` stays the fallback because it is what every share used before the
 * setting existed, so an unset value keeps the previous behaviour. The catalog
 * stays platform-neutral, so this is the only place the provider spelling is
 * decided.
 */
export function resolveLinkedInVisibility(
  settings: ChannelTargetSettings,
): string {
  const visibility = readChannelSettingString(settings, 'visibility');
  return visibility === 'CONNECTIONS' ? 'CONNECTIONS' : 'PUBLIC';
}

@Injectable()
export class LinkedInService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly apiBaseUrl =
    LINKEDIN_PROVIDER?.endpoints.apiBaseUrl ?? 'https://api.linkedin.com/v2';
  private authClient: AuthClient;
  private readonly analyticsService: LinkedInAnalyticsService;
  private readonly integrationHttpClient: IntegrationHttpClient;

  constructor(
    private readonly configService: ConfigService,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
    @Inject(SERVER_TOKENS.linkedInTrends)
    private readonly trendResolver: ServerLinkedInTrendResolver,
  ) {
    this.integrationHttpClient = new IntegrationHttpClient({
      fetch: (input, init) => this.fetchViaHttpService(input, init),
      logger: this.loggerService,
    });
    this.authClient = new AuthClient({
      clientId: this.configService.get('LINKEDIN_CLIENT_ID') as string,
      clientSecret: this.configService.get('LINKEDIN_CLIENT_SECRET') as string,
      redirectUrl: this.configService.get('LINKEDIN_REDIRECT_URI') as string,
    });
    this.analyticsService = new LinkedInAnalyticsService(
      this.httpService,
      this.loggerService,
      (organizationId, brandId, credentialId) =>
        this.refreshToken(organizationId, brandId, credentialId),
    );
  }

  private getApiUrl(path: string): string {
    return `${this.apiBaseUrl}/${path}`;
  }

  private toHttpServiceParams(
    searchParams: URLSearchParams,
  ): Record<string, string | number> {
    return Object.fromEntries(
      [...searchParams.entries()].map(([key, value]) => {
        const numericValue = Number(value);
        return [
          key,
          value.trim() !== '' && Number.isFinite(numericValue)
            ? numericValue
            : value,
        ];
      }),
    );
  }

  private async fetchViaHttpService(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const parsedUrl = new URL(String(input));
    const url = `${parsedUrl.origin}${parsedUrl.pathname}`;
    const params = this.toHttpServiceParams(parsedUrl.searchParams);
    const options = {
      headers: init?.headers as Record<string, string> | undefined,
      params,
      ...(init?.signal ? { signal: init.signal } : {}),
      timeout: 30000,
    };
    const method = init?.method ?? 'GET';
    const response = await firstValueFrom(
      method === 'POST'
        ? this.httpService.post(url, init?.body ?? null, options)
        : method === 'PUT'
          ? this.httpService.put(url, init?.body, options)
          : this.httpService.get(url, options),
    );

    return new Response(JSON.stringify(response.data), {
      headers: { 'content-type': 'application/json' },
      status: response.status ?? 200,
    });
  }

  public generateAuthUrl(state: string): string {
    const clientId = this.configService.get('LINKEDIN_CLIENT_ID');
    const redirectUri = this.configService.get('LINKEDIN_REDIRECT_URI');

    if (
      typeof clientId !== 'string' ||
      clientId.trim() === '' ||
      typeof redirectUri !== 'string' ||
      redirectUri.trim() === ''
    ) {
      throw new HttpException(
        {
          detail:
            'The linkedin integration is missing its provider credentials on this server.',
          title: 'Integration not configured',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return this.authClient.generateMemberAuthorizationUrl(
      ['openid', 'profile', 'email', 'w_member_social'],
      state,
    );
  }

  public async exchangeAuthCodeForAccessToken(code: string): Promise<{
    accessToken: string;
    expiresIn: number;
    scope?: unknown;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const tokenResponse =
        await this.authClient.exchangeAuthCodeForAccessToken(code);

      const scope = readOAuthTokenScopeField(tokenResponse);

      return {
        accessToken: tokenResponse.access_token,
        expiresIn: tokenResponse.expires_in,
        ...(scope === undefined ? {} : { scope }),
      };
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed`,
        getSafeLinkedInOAuthErrorLog(error),
      );
      throw error;
    }
  }

  /**
   * @param credentialId - which connected LinkedIn account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async refreshToken(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<LinkedInCredential> {
    const credentials = (await this.credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      // A failed refresh flips isConnected off; the retry still has to find it.
      isDisconnectedIncluded: true,
      organizationId,
      platform: CredentialPlatform.LINKEDIN,
    })) as LinkedInCredential | null;

    if (!credentials) {
      throw new Error('LinkedIn credential not found');
    }

    try {
      // LinkedIn OAuth 2.0 uses refresh tokens
      if (credentials.refreshToken) {
        // Decrypt the refresh token before use
        const decryptedRefreshToken = EncryptionUtil.decrypt(
          credentials.refreshToken,
        );

        const refreshResponse =
          await this.authClient.exchangeRefreshTokenForAccessToken(
            decryptedRefreshToken,
          );

        return await this.credentialsService.patch(credentials.id, {
          accessToken: refreshResponse.access_token,
          accessTokenExpiry: refreshResponse.expires_in
            ? new Date(Date.now() + refreshResponse.expires_in * 1000)
            : undefined,
          isConnected: true,
          isDeleted: false,
          refreshToken:
            refreshResponse.refresh_token || credentials.refreshToken,
          ...buildGrantedScopesCredentialPatch(
            readOAuthTokenScopeField(refreshResponse),
          ),
        });
      }

      // If no refresh token, return existing credentials
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

  public async getUserProfile(accessToken: string): Promise<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    picture?: string;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.integrationHttpClient.request<{
        email: string;
        family_name: string;
        given_name: string;
        picture?: string;
        sub: string;
      }>({
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        provider: LINKEDIN_PROVIDER,
        timeoutMs: 30000,
        url: this.getApiUrl('userinfo'),
      });

      return {
        email: response.email,
        firstName: response.given_name,
        id: response.sub,
        lastName: response.family_name,
        ...(response.picture ? { picture: response.picture } : {}),
      };
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed`,
        getSafeLinkedInOAuthErrorLog(error),
      );
      throw error;
    }
  }

  /**
   * @param credentialId - which connected LinkedIn account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async uploadImage(
    organizationId: string,
    brandId: string,
    imageUrl: string,
    caption: string,
    settings: ChannelTargetSettings = {},
    credentialId?: string,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(
        organizationId,
        brandId,
        credentialId,
      );

      if (!credential?.accessToken) {
        throw new Error('LinkedIn credential not found or invalid');
      }

      // Decrypt access token before use
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      const userInfo = await this.getUserProfile(decryptedAccessToken);
      const personURN = `urn:li:person:${userInfo.id}`;

      // Step 1: Register image upload
      const registerResponse = await firstValueFrom(
        this.httpService.post(
          'https://api.linkedin.com/v2/assets?action=registerUpload',
          {
            registerUploadRequest: {
              owner: personURN,
              recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
              serviceRelationships: [
                {
                  identifier: 'urn:li:userGeneratedContent',
                  relationshipType: 'OWNER',
                },
              ],
            },
          },
          {
            headers: {
              Authorization: `Bearer ${decryptedAccessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const assetId = registerResponse.data.value.asset;
      const uploadUrl =
        registerResponse.data.value.uploadMechanism[
          'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
        ].uploadUrl;

      // Step 2: Upload image
      const imageRes = await firstValueFrom(
        this.httpService.get(imageUrl, {
          responseType: 'arraybuffer',
        }),
      );

      await firstValueFrom(
        this.httpService.put(uploadUrl, imageRes.data, {
          headers: {
            Authorization: `Bearer ${decryptedAccessToken}`,
            'Content-Type': 'application/octet-stream',
          },
        }),
      );

      // Step 3: Create share with image
      const shareResponse = await firstValueFrom(
        this.httpService.post(
          'https://api.linkedin.com/v2/ugcPosts',
          {
            author: personURN,
            lifecycleState: 'PUBLISHED',
            specificContent: {
              'com.linkedin.ugc.ShareContent': {
                media: [
                  {
                    description: {
                      text: caption,
                    },
                    media: assetId,
                    status: 'READY',
                  },
                ],
                shareCommentary: {
                  text: caption,
                },
                shareMediaCategory: 'IMAGE',
              },
            },
            visibility: {
              'com.linkedin.ugc.MemberNetworkVisibility':
                resolveLinkedInVisibility(settings),
            },
          },
          {
            headers: {
              Authorization: `Bearer ${decryptedAccessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, shareResponse.data);
      return shareResponse.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * @param credentialId - which connected LinkedIn account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async createTextPost(
    organizationId: string,
    brandId: string,
    text: string,
    settings: ChannelTargetSettings = {},
    credentialId?: string,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(
        organizationId,
        brandId,
        credentialId,
      );

      if (!credential?.accessToken) {
        throw new Error('LinkedIn credential not found or invalid');
      }

      // Decrypt access token before use
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      const userInfo = await this.getUserProfile(decryptedAccessToken);
      const personURN = `urn:li:person:${userInfo.id}`;

      const shareResponse = await this.integrationHttpClient.request<unknown>({
        body: {
          author: personURN,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: {
                text,
              },
              shareMediaCategory: 'NONE',
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility':
              resolveLinkedInVisibility(settings),
          },
        },
        headers: {
          Authorization: `Bearer ${decryptedAccessToken}`,
        },
        method: 'POST',
        provider: LINKEDIN_PROVIDER,
        timeoutMs: 30000,
        url: this.getApiUrl('ugcPosts'),
      });

      this.loggerService.log(`${url} success`, shareResponse);
      return shareResponse;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * @param credentialId - which connected LinkedIn account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async uploadVideo(
    organizationId: string,
    brandId: string,
    videoUrl: string,
    caption: string,
    settings: ChannelTargetSettings = {},
    credentialId?: string,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(
        organizationId,
        brandId,
        credentialId,
      );

      if (!credential?.accessToken) {
        throw new Error('LinkedIn credential not found or invalid');
      }

      // Decrypt access token before use
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      const userInfo = await this.getUserProfile(decryptedAccessToken);
      const personURN = `urn:li:person:${userInfo.id}`;

      // Step 1: Register video upload
      const registerResponse = await firstValueFrom(
        this.httpService.post(
          'https://api.linkedin.com/v2/assets?action=registerUpload',
          {
            registerUploadRequest: {
              owner: personURN,
              recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
              serviceRelationships: [
                {
                  identifier: 'urn:li:userGeneratedContent',
                  relationshipType: 'OWNER',
                },
              ],
            },
          },
          {
            headers: {
              Authorization: `Bearer ${decryptedAccessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const assetId = registerResponse.data.value.asset;
      const uploadUrl =
        registerResponse.data.value.uploadMechanism[
          'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
        ].uploadUrl;

      // Step 2: Upload video
      const videoRes = await firstValueFrom(
        this.httpService.get(videoUrl, {
          responseType: 'arraybuffer',
        }),
      );

      await firstValueFrom(
        this.httpService.put(uploadUrl, videoRes.data, {
          headers: {
            Authorization: `Bearer ${decryptedAccessToken}`,
            'Content-Type': 'application/octet-stream',
          },
        }),
      );

      // Step 3: Create share with video
      const shareResponse = await firstValueFrom(
        this.httpService.post(
          'https://api.linkedin.com/v2/ugcPosts',
          {
            author: personURN,
            lifecycleState: 'PUBLISHED',
            specificContent: {
              'com.linkedin.ugc.ShareContent': {
                media: [
                  {
                    description: {
                      text: caption,
                    },
                    media: assetId,
                    status: 'READY',
                  },
                ],
                shareCommentary: {
                  text: caption,
                },
                shareMediaCategory: 'VIDEO',
              },
            },
            visibility: {
              'com.linkedin.ugc.MemberNetworkVisibility':
                resolveLinkedInVisibility(settings),
            },
          },
          {
            headers: {
              Authorization: `Bearer ${decryptedAccessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, shareResponse.data);
      return shareResponse.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /** LinkedIn has no public trend endpoint; delegate to the API-owned resolver. */
  public async getTrends(
    organizationId?: string,
    brandId?: string,
  ): Promise<ServerLinkedInTrend[]> {
    return this.trendResolver.resolve(organizationId, brandId);
  }

  /**
   * List comments on one published LinkedIn share/UGC post.
   * Replies keep the top-level comment id as their thread id.
   */
  /**
   * @param credentialId - which connected LinkedIn account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async listPostComments(
    organizationId: string,
    brandId: string,
    postUrn: string,
    options: { limit?: number; start?: number } = {},
    credentialId?: string,
  ): Promise<LinkedInInboxComment[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(
        organizationId,
        brandId,
        credentialId,
      );
      if (!credential?.accessToken) {
        throw new Error('LinkedIn credential not found or invalid');
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );
      const count = Math.min(Math.max(options.limit ?? 25, 1), 100);
      const start = Math.max(options.start ?? 0, 0);

      const response = await firstValueFrom(
        this.httpService.get<LinkedInCommentsResponse>(
          `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postUrn)}/comments`,
          {
            headers: {
              Authorization: `Bearer ${decryptedAccessToken}`,
              'X-Restli-Protocol-Version': '2.0.0',
            },
            params: { count, start },
            timeout: 30000,
          },
        ),
      );

      const comments = (response.data.elements ?? []).flatMap((element) => {
        const commentId = element.id ?? element.$URN;
        const text = element.message?.text;
        if (!commentId || !text) {
          return [];
        }

        const createdAt =
          typeof element.created?.time === 'number'
            ? new Date(element.created.time)
            : new Date();

        return [
          {
            authorExternalId: element.actor,
            commentId,
            createdAt: Number.isNaN(createdAt.getTime())
              ? new Date()
              : createdAt,
            text,
            threadId: element.parentComment ?? commentId,
          } satisfies LinkedInInboxComment,
        ];
      });

      this.loggerService.log(`${url} succeeded`, {
        count: comments.length,
        postUrn,
        start,
      });

      return comments;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * LinkedIn member messaging is a partner API. The connected-account OAuth
   * path only requests `w_member_social`, so DMs stay closed unless a later
   * grant adds a mailbox scope.
   */
  /**
   * @param credentialId - which connected LinkedIn account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async listDirectMessages(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<LinkedInDirectMessageListing> {
    const credential = await this.credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      isDisconnectedIncluded: true,
      organizationId,
      platform: CredentialPlatform.LINKEDIN,
    });

    const grantedScopes = credential?.grantedScopes ?? [];
    const isPermitted = grantedScopes.some((scope) =>
      LINKEDIN_MESSAGING_SCOPES.has(scope),
    );

    if (!isPermitted) {
      return {
        isPermitted: false,
        reason: LINKEDIN_DM_UNAVAILABLE_REASON,
        threads: [],
      };
    }

    // Mailbox scope is granted, but the partner messaging API is not wired.
    // Report unavailable so a granted scope is never a successful empty inbox.
    return {
      isImplemented: false,
      isPermitted: true,
      reason: LINKEDIN_DM_NOT_IMPLEMENTED_REASON,
      threads: [],
    };
  }

  /**
   * Post a comment on a LinkedIn post
   * @param organizationId The organization ID
   * @param brandId The brand ID
   * @param postUrn The LinkedIn post URN (e.g., urn:li:share:123456789)
   * @param text The comment text
   * @returns The comment URN
   */
  /**
   * @param credentialId - which connected LinkedIn account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async postComment(
    organizationId: string,
    brandId: string,
    postUrn: string,
    text: string,
    credentialId?: string,
  ): Promise<{ commentId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(
        organizationId,
        brandId,
        credentialId,
      );

      if (!credential?.accessToken) {
        throw new Error('LinkedIn credential not found or invalid');
      }

      // Decrypt access token before use
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      const userInfo = await this.getUserProfile(decryptedAccessToken);
      const personURN = `urn:li:person:${userInfo.id}`;

      // LinkedIn Comments API
      const response = await firstValueFrom(
        this.httpService.post(
          `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postUrn)}/comments`,
          {
            actor: personURN,
            message: {
              text,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${decryptedAccessToken}`,
              'Content-Type': 'application/json',
              'X-Restli-Protocol-Version': '2.0.0',
            },
          },
        ),
      );

      this.loggerService.log(`${url} succeeded`, response.data);

      // Extract comment ID from response
      const commentId = response.data?.id || response.data?.$URN;

      return { commentId };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Get analytics for LinkedIn media (posts, images, videos, articles)
   * @param organizationId The organization ID
   * @param brandId The brand ID
   * @param shareId The LinkedIn share/post ID (URN format)
   * @returns Analytics data including views, likes, comments, shares, impressions
   */
  /**
   * @param credentialId - which connected LinkedIn account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async getMediaAnalytics(
    organizationId: string,
    brandId: string,
    shareId: string,
    credentialId?: string,
  ): Promise<LinkedInMediaAnalytics> {
    return this.analyticsService.getMediaAnalytics(
      organizationId,
      brandId,
      shareId,
      credentialId,
    );
  }
}
