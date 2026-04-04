import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { ConfigService } from '@api/config/config.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { WhatsappService } from '@api/services/integrations/whatsapp/services/whatsapp.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class WhatsappPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.WHATSAPP;
  readonly supportsTextOnly = true;
  readonly supportsImages = true;
  readonly supportsVideos = false;
  readonly supportsCarousel = false;
  readonly supportsThreads = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly whatsappService: WhatsappService,
  ) {
    super(configService, logger);
  }

  async publish(context: PublishContext): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { post, credential } = context;
    const mediaInfo = this.extractMediaInfo(post);

    this.logPublishAttempt(context, mediaInfo);

    const validation = this.validatePost(context, mediaInfo);
    if (!validation.valid) {
      return this.createFailedResult(this.platform, validation.error);
    }

    try {
      const recipientNumber = credential.externalId;
      if (!recipientNumber) {
        this.logger.error(`${url} WhatsApp recipient number not found`, {
          postId: context.postId,
        });
        return this.createFailedResult(
          this.platform,
          'WhatsApp recipient number not configured in credential',
        );
      }

      const caption = this.sanitizeDescription(post.description);

      let messageSid: string | null = null;

      if (mediaInfo.hasIngredients && mediaInfo.isImagePost) {
        const result = await this.whatsappService.sendMediaMessage({
          body: caption,
          mediaUrl: mediaInfo.mediaUrls[0],
          to: recipientNumber,
        });
        messageSid = result?.sid || null;
      } else {
        const result = await this.whatsappService.sendTextMessage({
          body: caption,
          to: recipientNumber,
        });
        messageSid = result?.sid || null;
      }

      if (!messageSid) {
        return this.createFailedResult(
          this.platform,
          'Failed to get message SID from Twilio',
        );
      }

      const postUrl = this.buildPostUrl(messageSid, credential);
      return this.createSuccessResult(messageSid, this.platform, postUrl);
    } catch (error: unknown) {
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });
      throw error;
    }
  }

  buildPostUrl(
    _externalId: string,
    _credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    return '';
  }
}
