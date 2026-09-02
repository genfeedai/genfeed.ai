import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import {
  getInstagramErrorCode,
  isInstagramAuthorizationError,
} from '@api/services/integrations/instagram/utils/instagram-error.util';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/contracts';
import type {
  InstagramAccountDetails,
  InstagramConversationThread,
  InstagramCredentialResponse,
  InstagramGraphCommentNode,
  InstagramGraphCommentsResponse,
  InstagramGraphConversationNode,
  InstagramGraphConversationsResponse,
  InstagramMediaComment,
  InstagramPageResponse,
  InstagramTrendingHashtag,
} from '@genfeedai/contracts/interfaces/integrations/instagram.interface';
import {
  buildGrantedScopesCredentialPatch,
  readOAuthTokenScopeField,
} from '@genfeedai/helpers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import {
  InstagramAnalyticsService,
  type InstagramMediaAnalytics,
} from './instagram-analytics.service';
import { InstagramPublishingService } from './instagram-publishing.service';

function requireString(
  value: string | null | undefined,
  field: string,
): string {
  if (!value) {
    throw new Error(`Instagram credential is missing ${field}`);
  }

  return value;
}

const INSTAGRAM_TOKEN_REFRESH_BUFFER_MS = 7 * 24 * 60 * 60 * 1000;

const INSTAGRAM_COMMENT_NODE_FIELDS =
  'id,text,timestamp,username,from{id,username}';
const INSTAGRAM_COMMENT_FIELDS = `${INSTAGRAM_COMMENT_NODE_FIELDS},replies{${INSTAGRAM_COMMENT_NODE_FIELDS}}`;
const INSTAGRAM_MESSAGE_NODE_FIELDS =
  'id,message,created_time,from{id,username,name}';

function boundGraphLimit(limit: number): number {
  return Math.min(Math.max(Math.floor(limit), 1), 100);
}

function toGraphDate(value?: string): Date {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Flatten a top-level comment plus its replies into one list, with every entry
 * carrying the top-level comment id as its thread id — the same shape the
 * YouTube ingestion path consumes.
 */
function toMediaComments(
  node: InstagramGraphCommentNode,
): InstagramMediaComment[] {
  const threadId = node.id;

  if (!threadId) {
    return [];
  }

  return [node, ...(node.replies?.data ?? [])].flatMap((comment) => {
    if (!comment.id || !comment.text) {
      return [];
    }

    return [
      {
        authorExternalId: comment.from?.id,
        authorUsername: comment.from?.username ?? comment.username,
        commentId: comment.id,
        createdAt: toGraphDate(comment.timestamp),
        text: comment.text,
        threadId,
      },
    ];
  });
}

function toConversationThread(
  node: InstagramGraphConversationNode,
  accountExternalId: string,
): InstagramConversationThread[] {
  if (!node.id) {
    return [];
  }

  const participant = (node.participants?.data ?? []).find(
    (entry) => entry.id && entry.id !== accountExternalId,
  );

  // Only the counterparty's messages become inbox messages. Our own sends are
  // recorded when the DM action runs, so ingesting them back would duplicate
  // the outbound side of the thread as inbound.
  const messages = (node.messages?.data ?? []).flatMap((message) => {
    if (
      !message.id ||
      !message.message ||
      message.from?.id === accountExternalId
    ) {
      return [];
    }

    return [
      {
        createdAt: toGraphDate(message.created_time),
        messageId: message.id,
        senderExternalId: message.from?.id,
        senderName: message.from?.name,
        senderUsername: message.from?.username,
        text: message.message,
      },
    ];
  });

  return [
    {
      conversationId: node.id,
      messages,
      participantExternalId: participant?.id,
      participantName: participant?.name,
      participantUsername: participant?.username,
      updatedAt: node.updated_time ? toGraphDate(node.updated_time) : undefined,
    },
  ];
}

// NOTE: `accessToken` here is the stored (encrypted-at-rest) value. Callers must
// run it through `EncryptionUtil.decrypt()` before using it against the Graph API.
function toInstagramCredentialResponse(
  credential: CredentialDocument,
): InstagramCredentialResponse {
  return {
    id: credential.id,
    accessToken: requireString(credential.accessToken, 'accessToken'),
    externalId: credential.externalId ?? undefined,
    isConnected: credential.isConnected,
  };
}

@Injectable()
export class InstagramService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly graphUrl: string = 'https://graph.facebook.com';
  private readonly apiVersion: string;
  private readonly analyticsService: InstagramAnalyticsService;
  private readonly publishingService: InstagramPublishingService;

  constructor(
    private readonly configService: ConfigService,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {
    this.apiVersion =
      this.configService.get('INSTAGRAM_API_VERSION') || 'v24.0';
    this.publishingService = new InstagramPublishingService(
      this.httpService,
      this.loggerService,
      this.graphUrl,
      this.apiVersion,
      (organizationId, brandId, credentialId) =>
        this.getValidCredential(organizationId, brandId, credentialId),
    );
    this.analyticsService = new InstagramAnalyticsService(
      this.httpService,
      this.loggerService,
      this.graphUrl,
      this.apiVersion,
      (organizationId, brandId, credentialId) =>
        this.getValidCredential(organizationId, brandId, credentialId),
    );
  }

  private shouldRefreshAccessToken(expiresAt?: Date | string | null): boolean {
    if (!expiresAt) {
      return true;
    }

    const expiresAtMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) {
      return true;
    }

    return expiresAtMs <= Date.now() + INSTAGRAM_TOKEN_REFRESH_BUFFER_MS;
  }

  /**
   * Resolve the Instagram account this call acts as.
   *
   * `credentialId` names the account explicitly — that is the shape every
   * publish path uses, because a brand may hold several Instagram accounts and
   * the post already knows which one it belongs to. Without one the brand's
   * default account answers, and the resolver logs the ambiguity.
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
      platform: CredentialPlatform.INSTAGRAM,
    });
  }

  public async getValidCredential(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<InstagramCredentialResponse> {
    const credential = await this.findCredential(
      organizationId,
      brandId,
      credentialId,
    );

    if (!credential) {
      throw new Error('Instagram credential not found');
    }

    if (!credential.accessToken) {
      await this.credentialsService.patch(credential.id, {
        isConnected: false,
      });
      throw new Error(
        'Instagram access token not found. Please reconnect your account.',
      );
    }

    if (this.shouldRefreshAccessToken(credential.accessTokenExpiry)) {
      return this.refreshToken(organizationId, brandId, credentialId);
    }

    return toInstagramCredentialResponse(credential);
  }

  public async getAccountDetails(
    accessToken: string,
  ): Promise<InstagramAccountDetails> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get<InstagramAccountDetails>(`${this.graphUrl}/me`, {
          params: {
            access_token: accessToken,
            fields: 'id,username,account_type,media_count',
          },
        }),
      );

      this.loggerService.log(`${url} succeeded`, {
        accountId: response.data.id,
      });

      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async getInstagramPages(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<InstagramPageResponse[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.getValidCredential(
        organizationId,
        brandId,
        credentialId,
      );

      const accessToken = EncryptionUtil.decrypt(credential.accessToken);

      const pages: InstagramPageResponse[] = [];

      // 2. Get list of Facebook Pages the user manages
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.graphUrl}/${this.apiVersion}/me/accounts`,
          {
            params: {
              access_token: accessToken,
              fields:
                'id,instagram_business_account{id,name,username,profile_picture_url}',
            },
          },
        ),
      );

      const userPages = response.data.data || [];
      const businessPages = userPages
        .filter(
          (page: { instagram_business_account?: Record<string, unknown> }) =>
            page.instagram_business_account,
        )
        .map(
          (page: {
            instagram_business_account: {
              id: string;
              name: string;
              username: string;
              profile_picture_url: string;
            };
          }) => ({
            id: page.instagram_business_account.id,
            image: page.instagram_business_account.profile_picture_url,
            label: page.instagram_business_account.name,
            username: page.instagram_business_account.username,
          }),
        );

      // 3. For each page, check if it has an Instagram Business Account
      for (const page of businessPages) {
        try {
          // Check if this is a Business brand (can publish) or Creator brand (read-only)
          let isBusinessAccount = false;
          try {
            // Empty POST to media endpoint to test publishing capability
            await firstValueFrom(
              this.httpService.post(
                `${this.graphUrl}/${this.apiVersion}/${page.id}/media`,
                null,
                {
                  params: { access_token: accessToken },
                  validateStatus: (status) => status < 500, // Don't throw on 4xx errors
                },
              ),
            );
            isBusinessAccount = true;
          } catch (error: unknown) {
            // Error code 10 indicates Creator Account (can't publish)
            const response = (
              error as { response?: { data?: { error?: { code?: number } } } }
            )?.response;
            isBusinessAccount = !(response?.data?.error?.code === 10);
          }

          // Only include Business accounts that can publish content
          if (isBusinessAccount) {
            pages.push({
              ...page,
              isBusinessAccount,
              platform: CredentialPlatform.INSTAGRAM,
            });
          }
        } catch (error: unknown) {
          // Skip accounts we can't access or verify
          this.loggerService.warn(
            `${url} - Could not verify Instagram account ${page.id}`,
            error,
          );
        }
      }

      this.loggerService.log(`${url} succeeded`, {
        pagesCount: pages.length,
      });

      return pages;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Reuse the integration's reconnect lifecycle from auxiliary Instagram reads.
   * Returns false for permission, professional-account, and provider errors so
   * callers can preserve those states without disconnecting a valid credential.
   */
  public async handleAuthorizationError(
    credentialId: string,
    error: unknown,
    context: string,
  ): Promise<boolean> {
    if (!isInstagramAuthorizationError(error)) {
      return false;
    }

    try {
      await this.credentialsService.patch(credentialId, {
        isConnected: false,
      });
      this.loggerService.warn(
        `${context} - credential marked as disconnected due to auth error`,
        {
          credentialId,
          errorCode: getInstagramErrorCode(error),
        },
      );
    } catch (patchError: unknown) {
      this.loggerService.error(
        `${context} - failed to mark credential as disconnected`,
        patchError,
      );
    }

    return true;
  }

  public async refreshToken(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<InstagramCredentialResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.findCredential(
      organizationId,
      brandId,
      credentialId,
    );

    if (!credential) {
      throw new Error('Instagram credential not found');
    }

    if (!credential.accessToken) {
      // Mark as disconnected if no access token available
      await this.credentialsService.patch(credential.id, {
        isConnected: false,
      });
      throw new Error(
        'Instagram access token not found. Please reconnect your account.',
      );
    }

    // Decrypt access token before use
    const decryptedAccessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.graphUrl}/${this.apiVersion}/oauth/access_token`,
          {
            params: {
              client_id: this.configService.get('INSTAGRAM_APP_ID'),
              client_secret: this.configService.get('INSTAGRAM_APP_SECRET'),
              fb_exchange_token: decryptedAccessToken,
              grant_type: OAuthGrantType.FB_EXCHANGE_TOKEN,
            },
          },
        ),
      );

      const { access_token, expires_in } = response.data || {};

      if (!access_token) {
        throw new Error('Instagram refresh response missing access token');
      }

      this.loggerService.log(`${url} succeeded`, {
        expiresIn: expires_in,
        hasAccessToken: true,
      });

      const updatedCredential = await this.credentialsService.patch(
        credential.id,
        {
          accessToken: access_token,
          accessTokenExpiry: expires_in
            ? new Date(Date.now() + expires_in * 1000)
            : undefined,
          isConnected: true,
          refreshToken: null,
          refreshTokenExpiry: null,
          ...buildGrantedScopesCredentialPatch(
            readOAuthTokenScopeField(response.data),
          ),
        },
      );

      return toInstagramCredentialResponse(updatedCredential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      // Mark credential as disconnected if refresh fails (e.g., expired token)
      await this.credentialsService.patch(credential.id, {
        isConnected: false,
      });
      throw error;
    }
  }

  public async getTrends(
    organizationId?: string,
    brandId?: string,
  ): Promise<InstagramTrendingHashtag[]> {
    const url = `${this.constructorName} getTrends organizationId: ${organizationId} brandId: ${brandId}`;

    this.loggerService.log(url);

    try {
      const trendingHashtags: InstagramTrendingHashtag[] = [];

      if (!organizationId || !brandId) {
        this.loggerService.warn(
          `${url} - Instagram trend provider unavailable`,
          {
            reason: 'missing_organization_or_brand_scope',
          },
        );
      } else {
        try {
          const credential = await this.getValidCredential(
            organizationId,
            brandId,
          );

          if (credential.externalId) {
            // Decrypt access token before use
            const decryptedAccessToken = EncryptionUtil.decrypt(
              credential.accessToken,
            );

            // Fetch user's recent media to identify trending hashtags
            const recentMedia = await firstValueFrom(
              this.httpService.get(
                `${this.graphUrl}/${this.apiVersion}/${credential.externalId}/media`,
                {
                  params: {
                    access_token: decryptedAccessToken,
                    fields: 'caption,like_count,comments_count',
                    limit: 20,
                  },
                },
              ),
            );

            // Extract hashtags from recent posts
            if (recentMedia.data?.data) {
              const hashtagCounts = new Map<string, number>();
              (
                recentMedia.data.data as Array<{
                  caption?: string;
                  like_count?: number;
                  comments_count?: number;
                }>
              ).forEach((post) => {
                const caption = post.caption || '';
                const hashtags = caption.match(/#\w+/g) || [];
                hashtags.forEach((tag: string) => {
                  const count =
                    (post.like_count || 0) + (post.comments_count || 0);
                  hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + count);
                });
              });

              const personalizedTrends = Array.from(hashtagCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([tag, mentions]) => ({
                  growthRate: 0,
                  mentions,
                  topic: tag,
                }));

              trendingHashtags.push(...personalizedTrends);
            }
          } else {
            this.loggerService.warn(
              `${url} - Instagram trend provider unavailable`,
              {
                brandId,
                hasCredential: Boolean(credential),
                organizationId,
                reason: 'missing_instagram_credential',
              },
            );
          }
        } catch (error: unknown) {
          this.loggerService.warn(
            `${url} - Could not fetch personalized trends`,
            error,
          );
        }
      }

      return trendingHashtags;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Send a direct message to a user who commented
   * @param organizationId The organization ID
   * @param brandId The brand ID
   * @param recipientId The Instagram user ID of the commenter
   * @param message The message to send
   * @returns The sent message ID
   */
  public async sendCommentReplyDm(
    organizationId: string,
    brandId: string,
    recipientId: string,
    message: string,
    credentialId?: string,
  ): Promise<string | undefined> {
    return this.publishingService.sendCommentReplyDm(
      organizationId,
      brandId,
      recipientId,
      message,
      credentialId,
    );
  }

  /**
   * @param credentialId - which connected Instagram account posts this. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async uploadImage(
    organizationId: string,
    brandId: string,
    imageUrl: string,
    caption: string,
    hashtags?: string[],
    credentialId?: string,
  ): Promise<{ mediaId: string; shortcode: string }> {
    return this.publishingService.uploadImage(
      organizationId,
      brandId,
      imageUrl,
      caption,
      hashtags,
      credentialId,
    );
  }

  /**
   * Upload a video as a reel to Instagram
   * Reels are the recommended way to post videos since VIDEO media type is deprecated
   * @param isShareToFeedSelected Whether to share the reel to main feed (default: true)
   */
  /**
   * @param credentialId - which connected Instagram account posts this reel.
   */
  public async uploadReel(
    organizationId: string,
    brandId: string,
    videoUrl: string,
    caption: string,
    coverImageUrl?: string,
    hashtags?: string[],
    isShareToFeedSelected: boolean = true,
    credentialId?: string,
  ): Promise<{ mediaId: string; shortcode: string }> {
    return this.publishingService.uploadReel(
      organizationId,
      brandId,
      videoUrl,
      caption,
      coverImageUrl,
      hashtags,
      isShareToFeedSelected,
      credentialId,
    );
  }

  /**
   * @param credentialId - which connected Instagram account posts this carousel.
   */
  public async uploadCarousel(
    organizationId: string,
    brandId: string,
    mediaUrls: string[],
    caption: string,
    hashtags?: string[],
    credentialId?: string,
  ): Promise<{ mediaId: string; shortcode: string }> {
    return this.publishingService.uploadCarousel(
      organizationId,
      brandId,
      mediaUrls,
      caption,
      hashtags,
      credentialId,
    );
  }

  /**
   * Upload video as a reel (the default video upload method since VIDEO is deprecated)
   * Alias to uploadReel.
   */
  public uploadVideo(
    organizationId: string,
    brandId: string,
    videoUrl: string,
    caption: string,
    coverImageUrl?: string,
    hashtags?: string[],
    isShareToFeedSelected: boolean = true,
  ): Promise<{ mediaId: string; shortcode: string }> {
    // VIDEO media type is deprecated, so we use uploadReel instead
    return this.uploadReel(
      organizationId,
      brandId,
      videoUrl,
      caption,
      coverImageUrl,
      hashtags,
      isShareToFeedSelected,
    );
  }

  /**
   * Post a comment on an Instagram media
   * @param organizationId The organization ID
   * @param brandId The brand ID
   * @param mediaId The Instagram media ID to comment on
   * @param text The comment text
   * @returns The comment ID
   */
  /**
   * @param credentialId - the account that owns the media being replied to. A
   *   comment posted as a sibling account is a different account's comment.
   */
  public async postComment(
    organizationId: string,
    brandId: string,
    mediaId: string,
    text: string,
    credentialId?: string,
  ): Promise<{ commentId: string }> {
    return this.publishingService.postComment(
      organizationId,
      brandId,
      mediaId,
      text,
      credentialId,
    );
  }

  /**
   * Get analytics for any Instagram media (posts, images, videos, reels, carousels)
   * @param userId The user ID
   * @param brandId The brand ID
   * @param mediaId The Instagram media ID
   * @returns Analytics data including views, likes, comments, saves, shares, reach, impressions
   */
  public async getMediaAnalytics(
    organizationId: string,
    brandId: string,
    mediaId: string,
    credentialId?: string,
  ): Promise<InstagramMediaAnalytics> {
    return this.analyticsService.getMediaAnalytics(
      organizationId,
      brandId,
      mediaId,
      credentialId,
    );
  }

  public async replyToComment(
    organizationId: string,
    brandId: string,
    commentId: string,
    text: string,
    credentialId?: string,
  ): Promise<{ commentId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.getValidCredential(
        organizationId,
        brandId,
        credentialId,
      );
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${commentId}/replies`,
          null,
          {
            params: {
              access_token: decryptedAccessToken,
              message: text,
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

  /**
   * List comments (top-level plus their replies) on one published media object.
   */
  public async listMediaComments(
    organizationId: string,
    brandId: string,
    mediaId: string,
    limit = 25,
    credentialId?: string,
  ): Promise<InstagramMediaComment[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.getValidCredential(
        organizationId,
        brandId,
        credentialId,
      );
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      const response = await firstValueFrom(
        this.httpService.get<InstagramGraphCommentsResponse>(
          `${this.graphUrl}/${this.apiVersion}/${mediaId}/comments`,
          {
            params: {
              access_token: decryptedAccessToken,
              fields: INSTAGRAM_COMMENT_FIELDS,
              limit: boundGraphLimit(limit),
            },
          },
        ),
      );

      const comments = (response.data.data ?? []).flatMap(toMediaComments);

      this.loggerService.log(`${url} succeeded`, {
        count: comments.length,
        mediaId,
      });

      return comments;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Poll Graph conversations for the connected Instagram account. Each thread
   * is keyed by the Graph conversation id and carries only the counterparty's
   * inbound messages.
   */
  public async listConversations(
    organizationId: string,
    brandId: string,
    limit = 25,
    credentialId?: string,
  ): Promise<InstagramConversationThread[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.getValidCredential(
        organizationId,
        brandId,
        credentialId,
      );
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );
      const instagramAccountId = requireString(
        credential.externalId,
        'externalId',
      );
      const boundedLimit = boundGraphLimit(limit);

      const response = await firstValueFrom(
        this.httpService.get<InstagramGraphConversationsResponse>(
          `${this.graphUrl}/${this.apiVersion}/${instagramAccountId}/conversations`,
          {
            params: {
              access_token: decryptedAccessToken,
              fields: `id,updated_time,participants{id,username,name},messages.limit(${boundedLimit}){${INSTAGRAM_MESSAGE_NODE_FIELDS}}`,
              limit: boundedLimit,
              platform: 'instagram',
            },
          },
        ),
      );

      const threads = (response.data.data ?? []).flatMap((node) =>
        toConversationThread(node, instagramAccountId),
      );

      this.loggerService.log(`${url} succeeded`, {
        count: threads.length,
        instagramAccountId,
      });

      return threads;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
