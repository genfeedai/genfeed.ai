import { requireMetaScopes } from '@api/services/integrations/_shared/meta-page-access.util';
import { readInstagramVerificationPage } from '@api/services/integrations/instagram/services/instagram-verification-reader.util';
import {
  getInstagramGraphError,
  isInstagramRejectedRequestError,
} from '@api/services/integrations/instagram/utils/instagram-error.util';
import type { ProviderVerificationPage } from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import { InstagramMediaType } from '@genfeedai/contracts';
import type {
  InstagramCredentialResponse,
  InstagramMessageRecipient,
} from '@genfeedai/contracts/interfaces/integrations/instagram.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

type ResolveInstagramCredential = (
  organizationId: string,
  brandId: string,
  credentialId?: string,
) => Promise<InstagramCredentialResponse>;

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Instagram credential is missing ${field}`);
  }

  return value;
}

function formatCaption(caption: string, hashtags?: string[]): string {
  if (!hashtags?.length) {
    return caption;
  }
  return `${caption}\n\n${hashtags.map((tag) => `#${tag}`).join(' ')}`;
}

/** Owns Instagram write operations while the facade retains credential APIs. */
export class InstagramPublishingService {
  constructor(
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    private readonly graphUrl: string,
    private readonly apiVersion: string,
    private readonly resolveCredential: ResolveInstagramCredential,
  ) {}

  /** Replies inside the provider's existing messaging window. */
  @Traced()
  async sendDirectMessage(
    organizationId: string,
    brandId: string,
    recipientId: string,
    message: string,
    credentialId?: string,
  ): Promise<string> {
    return this.sendMessage(
      organizationId,
      brandId,
      { id: recipientId },
      message,
      credentialId,
    );
  }

  /**
   * Subscribes the Instagram account to the app's `messages` webhook so new
   * Direct messages are pushed instead of polled. The account itself is
   * subscribed with the client's Unified Login token; no Page is involved.
   *
   * @see https://developers.facebook.com/documentation/instagram-platform/webhooks/setup
   * @see https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks
   */
  @Traced()
  async subscribeToMessageWebhooks(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<void> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.resolveCredential(
        organizationId,
        brandId,
        credentialId,
      );
      requireMetaScopes(credential.grantedScopes, [
        'instagram_manage_messages',
      ]);
      const accessToken = EncryptionUtil.decrypt(credential.accessToken);
      const externalId = requireString(credential.externalId, 'externalId');
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${externalId}/subscribed_apps`,
          null,
          {
            params: {
              access_token: accessToken,
              subscribed_fields: 'messages',
            },
          },
        ),
      );

      this.loggerService.log(`${url} succeeded`, response.data);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /** Initial comment replies use comment_id, not the commenter's scoped ID. */
  @Traced()
  async sendPrivateReply(
    organizationId: string,
    brandId: string,
    commentId: string,
    message: string,
    credentialId?: string,
  ): Promise<string> {
    return this.sendMessage(
      organizationId,
      brandId,
      { comment_id: commentId },
      message,
      credentialId,
    );
  }

  @Traced()
  private async sendMessage(
    organizationId: string,
    brandId: string,
    recipient: InstagramMessageRecipient,
    message: string,
    credentialId?: string,
  ): Promise<string> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.resolveCredential(
        organizationId,
        brandId,
        credentialId,
      );
      const isPrivateReply = 'comment_id' in recipient;
      requireMetaScopes(
        credential.grantedScopes,
        isPrivateReply
          ? ['instagram_manage_comments', 'instagram_manage_messages']
          : ['instagram_manage_messages'],
      );
      const accessToken = EncryptionUtil.decrypt(credential.accessToken);
      const externalId = requireString(credential.externalId, 'externalId');
      // Unified Login sends from the account itself with the client's token;
      // no Facebook Page exists.
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${externalId}/messages`,
          {
            message: { text: message },
            ...('id' in recipient ? { messaging_type: 'RESPONSE' } : {}),
            recipient,
          },
          { params: { access_token: accessToken } },
        ),
      );

      this.loggerService.log(`${url} succeeded`, response.data);
      return requireString(
        response.data?.message_id,
        'message_id in the Meta response',
      );
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  @Traced()
  async uploadImage(
    organizationId: string,
    brandId: string,
    imageUrl: string,
    caption: string,
    hashtags?: string[],
    credentialId?: string,
    isAiGenerated = false,
  ): Promise<{ mediaId: string; shortcode: string }> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const externalId = requireString(credential.externalId, 'externalId');
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const createRes = await this.createMediaContainer(
        externalId,
        {
          access_token: accessToken,
          caption: formatCaption(caption, hashtags),
          image_url: imageUrl,
        },
        isAiGenerated,
      );
      const publishRes = await this.publishContainer(
        externalId,
        createRes.data.id,
        accessToken,
      );

      this.loggerService.log(`${url} succeeded`, publishRes.data);
      const mediaId = publishRes.data.id;
      return {
        mediaId,
        shortcode: await this.getMediaShortcode(mediaId, accessToken),
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  @Traced()
  async uploadReel(
    organizationId: string,
    brandId: string,
    videoUrl: string,
    caption: string,
    coverImageUrl?: string,
    hashtags?: string[],
    isShareToFeedSelected = true,
    credentialId?: string,
    isAiGenerated = false,
  ): Promise<{ mediaId: string; shortcode: string }> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const externalId = requireString(credential.externalId, 'externalId');
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const params: Record<string, string | boolean> = {
        access_token: accessToken,
        caption: formatCaption(caption, hashtags),
        media_type: InstagramMediaType.REELS,
        share_to_feed: isShareToFeedSelected,
        video_url: videoUrl,
      };
      if (coverImageUrl) {
        params.cover_url = coverImageUrl;
      }

      const createRes = await this.createMediaContainer(
        externalId,
        params,
        isAiGenerated,
      );
      const containerId = createRes.data.id;
      await this.waitForMediaProcessing(containerId, accessToken);
      const publishRes = await this.publishContainer(
        externalId,
        containerId,
        accessToken,
      );

      this.loggerService.log(`${url} succeeded`, publishRes.data);
      const mediaId = publishRes.data.id;
      return {
        mediaId,
        shortcode: await this.getMediaShortcode(mediaId, accessToken),
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  @Traced()
  async uploadCarousel(
    organizationId: string,
    brandId: string,
    mediaUrls: string[],
    caption: string,
    hashtags?: string[],
    credentialId?: string,
    isAiGenerated = false,
  ): Promise<{ mediaId: string; shortcode: string }> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const externalId = requireString(credential.externalId, 'externalId');
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const containerIds = [];
      for (const mediaUrl of mediaUrls) {
        const response = await firstValueFrom(
          this.httpService.post(
            `${this.graphUrl}/${this.apiVersion}/${externalId}/media`,
            null,
            {
              params: {
                access_token: accessToken,
                image_url: mediaUrl,
                is_carousel_item: true,
              },
            },
          ),
        );
        containerIds.push(response.data.id);
      }

      const carouselRes = await this.createMediaContainer(
        externalId,
        {
          access_token: accessToken,
          caption: formatCaption(caption, hashtags),
          children: containerIds.join(','),
          media_type: InstagramMediaType.CAROUSEL,
        },
        isAiGenerated,
      );
      const publishRes = await this.publishContainer(
        externalId,
        carouselRes.data.id,
        accessToken,
      );

      this.loggerService.log(`${url} succeeded`, publishRes.data);
      const mediaId = publishRes.data.id;
      return {
        mediaId,
        shortcode: await this.getMediaShortcode(mediaId, accessToken),
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * One page of the account's media created since a publish attempt began, for
   * confirming an uncertain publish. Reads only the account the post was
   * scheduled for: a changed or reconnected account is refused.
   */
  @Traced()
  async listPublishVerificationPage(
    organizationId: string,
    brandId: string,
    credentialId: string,
    expectedExternalId: string | null,
    attemptStartedAt: Date,
    cursor?: string,
  ): Promise<ProviderVerificationPage> {
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    if (
      !credential.externalId ||
      credential.externalId !== expectedExternalId
    ) {
      throw new Error('Instagram verification account unavailable or changed');
    }
    return readInstagramVerificationPage(
      this.httpService,
      `${this.graphUrl}/${this.apiVersion}`,
      credential.externalId,
      EncryptionUtil.decrypt(credential.accessToken),
      attemptStartedAt,
      cursor,
    );
  }

  @Traced()
  async postComment(
    organizationId: string,
    brandId: string,
    mediaId: string,
    text: string,
    credentialId?: string,
  ): Promise<{ commentId: string }> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.resolveCredential(
        organizationId,
        brandId,
        credentialId,
      );
      const accessToken = EncryptionUtil.decrypt(credential.accessToken);
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${mediaId}/comments`,
          null,
          { params: { access_token: accessToken, message: text } },
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
   * Creates the container that is published: the image, the Reel or the
   * carousel itself, never a carousel child. The AI label rides on it. If
   * Instagram refuses the request with a client error while the label is set,
   * the same container is created once more without the label and the post
   * goes out unlabelled, because a missed label costs less than a missed post.
   * Nothing is published at this step, so the retry cannot post twice.
   */
  private async createMediaContainer(
    externalId: string,
    params: Record<string, string | boolean>,
    isAiGenerated: boolean,
  ) {
    const create = (extra: Record<string, boolean>) =>
      firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${externalId}/media`,
          null,
          { params: { ...params, ...extra } },
        ),
      );

    if (!isAiGenerated) {
      return create({});
    }

    try {
      return await create({ is_ai_generated: true });
    } catch (error: unknown) {
      if (!isInstagramRejectedRequestError(error)) {
        throw error;
      }
      this.loggerService.warn(
        'Instagram refused the container with the AI label; creating it again without the label',
        { error: getInstagramGraphError(error)?.message },
      );
      return create({});
    }
  }

  private publishContainer(
    externalId: string,
    containerId: string,
    accessToken: string,
  ) {
    return firstValueFrom(
      this.httpService.post(
        `${this.graphUrl}/${this.apiVersion}/${externalId}/media_publish`,
        null,
        {
          params: {
            access_token: accessToken,
            creation_id: containerId,
          },
        },
      ),
    );
  }

  @Traced()
  private async waitForMediaProcessing(
    containerId: string,
    accessToken: string,
    maxAttempts = 30,
    delayMs = 2000,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const statusRes = await firstValueFrom(
        this.httpService.get(
          `${this.graphUrl}/${this.apiVersion}/${containerId}`,
          { params: { access_token: accessToken, fields: 'status_code' } },
        ),
      );
      if (statusRes.data.status_code === 'FINISHED') {
        return;
      }
      if (statusRes.data.status_code === 'ERROR') {
        throw new Error('Media processing failed');
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error('Media processing timeout');
  }

  @Traced()
  private async getMediaShortcode(
    mediaId: string,
    accessToken: string,
  ): Promise<string> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.graphUrl}/${this.apiVersion}/${mediaId}`, {
          params: { access_token: accessToken, fields: 'shortcode' },
        }),
      );
      const shortcode = response.data?.shortcode;
      if (!shortcode) {
        this.loggerService.error(
          `${url} - No shortcode found in response, using numeric ID`,
          { mediaId },
        );
        return mediaId;
      }

      this.loggerService.log(`${url} - Retrieved shortcode for media`, {
        mediaId,
        shortcode,
      });
      return shortcode;
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} - Failed to fetch shortcode, using numeric ID`,
        { error, mediaId },
      );
      return mediaId;
    }
  }
}
