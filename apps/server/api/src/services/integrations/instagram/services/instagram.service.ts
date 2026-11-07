import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import { recordTrendProviderOutcome } from '@api/collections/trends/utils/trend-refresh-evidence.util';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import { requireMetaScopes } from '@api/services/integrations/_shared/meta-page-access.util';
import {
  getInstagramErrorCode,
  isInstagramAuthorizationError,
} from '@api/services/integrations/instagram/utils/instagram-error.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import type {
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
import { buildGrantedScopesCredentialPatch } from '@genfeedai/helpers';
import {
  META_GRAPH_API_VERSION,
  META_GRAPH_URL,
} from '@genfeedai/integrations';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { InstagramAccountsService } from './instagram-accounts.service';
import {
  InstagramAnalyticsService,
  type InstagramMediaAnalytics,
} from './instagram-analytics.service';
import { InstagramPublishingService } from './instagram-publishing.service';

const HASHTAGS_PATTERN = /#\w+/g;

function requireString(
  value: string | null | undefined,
  field: string,
): string {
  if (!value) {
    throw new Error(`Instagram credential is missing ${field}`);
  }

  return value;
}

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
    ...(credential.grantedScopesCapturedAt
      ? { grantedScopes: credential.grantedScopes }
      : {}),
  };
}

@Traced()
@Injectable()
export class InstagramService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly graphUrl: string = META_GRAPH_URL;
  private readonly apiVersion: string;
  private readonly analyticsService: InstagramAnalyticsService;
  private readonly publishingService: InstagramPublishingService;
  private readonly accountsService: InstagramAccountsService;

  constructor(
    private readonly configService: ConfigService,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {
    this.apiVersion =
      this.configService.get('INSTAGRAM_API_VERSION') || META_GRAPH_API_VERSION;
    this.accountsService = new InstagramAccountsService(
      this.httpService,
      this.loggerService,
      this.graphUrl,
      this.apiVersion,
    );
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

  public getGraphApiBaseUrl(): string {
    return `${this.graphUrl}/${this.apiVersion}`;
  }

  private isBusinessTokenExpired(expiresAt?: Date | string | null): boolean {
    if (!expiresAt) {
      return false;
    }

    const expiresAtMs = new Date(expiresAt).getTime();
    return Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
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

    await this.requireUnifiedLoginConnection(credential);

    // A Business Integration System User token has no refresh exchange. It
    // lasts as configured (never, by default) until the client removes the
    // app or moves the account, so the only local question is a stored
    // expiry; anything else is found out by the call itself.
    if (this.isBusinessTokenExpired(credential.accessTokenExpiry)) {
      await this.credentialsService.patch(credential.id, {
        isConnected: false,
      });
      throw new Error(
        'Instagram connection expired. Please reconnect your account.',
      );
    }

    return toInstagramCredentialResponse(credential);
  }

  /**
   * Reuse the integration's reconnect lifecycle from auxiliary Instagram reads.
   * Returns false for permission, professional-account, and provider errors so
   * callers can preserve those states without disconnecting a valid credential.
   */
  /**
   * Every Instagram professional account the client's Business Integration
   * System User token was assigned. See `InstagramAccountsService`.
   */
  public async listAuthorizedInstagramAccounts(
    accessToken: string,
  ): Promise<InstagramPageResponse[]> {
    return this.accountsService.listAuthorizedInstagramAccounts(accessToken);
  }

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

    await this.requireUnifiedLoginConnection(credential);

    return this.revalidateBusinessToken(credential, decryptedAccessToken);
  }

  /**
   * Instagram connects only through Instagram API with Unified Login, which
   * records the client's business portfolio. A credential without one is a
   * retired Facebook-Login (Page) connection: it is disconnected so the brand
   * reconnects.
   */
  private async requireUnifiedLoginConnection(
    credential: CredentialDocument,
  ): Promise<void> {
    if (credential.externalBusinessId) {
      return;
    }

    await this.credentialsService.patch(credential.id, {
      isConnected: false,
    });
    throw new Error(
      'Instagram now connects without a Facebook Page. Please reconnect your account.',
    );
  }

  /**
   * A Business Integration System User token cannot be exchanged for a fresh
   * one; "refresh" re-reads what Meta says about it. The token is kept and its
   * granted permissions and expiry are re-recorded. Only a token Meta reports
   * invalid, or rejects, disconnects the account; a transient failure leaves
   * it connected for the next attempt.
   */
  private async revalidateBusinessToken(
    credential: CredentialDocument,
    decryptedAccessToken: string,
  ): Promise<InstagramCredentialResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.graphUrl}/${this.apiVersion}/debug_token`,
          {
            params: {
              access_token: `${this.configService.get('INSTAGRAM_APP_ID')}|${this.configService.get('INSTAGRAM_APP_SECRET')}`,
              input_token: decryptedAccessToken,
            },
            timeout: 10_000,
          },
        ),
      );
      const tokenInfo = response.data?.data;

      if (!tokenInfo?.is_valid) {
        await this.credentialsService.patch(credential.id, {
          isConnected: false,
        });
        throw new Error(
          'Instagram connection is no longer valid. Please reconnect your account.',
        );
      }

      this.loggerService.log(`${url} succeeded`, {
        hasExpiry: Boolean(tokenInfo.expires_at),
      });

      const updatedCredential = await this.credentialsService.patch(
        credential.id,
        {
          // `expires_at: 0` is Meta's "never expires".
          accessTokenExpiry: tokenInfo.expires_at
            ? new Date(tokenInfo.expires_at * 1000)
            : null,
          isConnected: true,
          ...buildGrantedScopesCredentialPatch(
            Array.isArray(tokenInfo.scopes) ? tokenInfo.scopes : undefined,
          ),
        },
      );

      return toInstagramCredentialResponse(updatedCredential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      if (isInstagramAuthorizationError(error)) {
        await this.credentialsService.patch(credential.id, {
          isConnected: false,
        });
      }
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
        recordTrendProviderOutcome('native_empty', 'native_unavailable');
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
                const hashtags = caption.match(HASHTAGS_PATTERN) || [];
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
            recordTrendProviderOutcome('native_empty', 'native_unavailable');
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
          recordTrendProviderOutcome('native_failed', 'native_failed');
          this.loggerService.warn(
            `${url} - Could not fetch personalized trends`,
            error,
          );
        }
      }

      return trendingHashtags;
    } catch (error: unknown) {
      recordTrendProviderOutcome('native_failed', 'native_failed');
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Send a direct message to a user who commented
   * @param organizationId The organization ID
   * @param brandId The brand ID
   * @param recipientId The Instagram-scoped ID of an existing messaging participant
   * @param message The message to send
   * @returns The sent message ID
   */
  public async sendDirectMessage(
    organizationId: string,
    brandId: string,
    recipientId: string,
    message: string,
    credentialId?: string,
  ): Promise<string> {
    return this.publishingService.sendDirectMessage(
      organizationId,
      brandId,
      recipientId,
      message,
      credentialId,
    );
  }

  public async subscribeToMessageWebhooks(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<void> {
    return this.publishingService.subscribeToMessageWebhooks(
      organizationId,
      brandId,
      credentialId,
    );
  }

  public async sendPrivateReply(
    organizationId: string,
    brandId: string,
    commentId: string,
    message: string,
    credentialId?: string,
  ): Promise<string> {
    return this.publishingService.sendPrivateReply(
      organizationId,
      brandId,
      commentId,
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
   * @returns Analytics data including views, likes, comments, saves, shares, and reach
   */
  public async getMediaAnalytics(
    organizationId: string,
    brandId: string,
    mediaId: string,
    credentialId: string,
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
      requireMetaScopes(credential.grantedScopes, [
        'instagram_manage_messages',
      ]);
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
