import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { WhatsappService } from '@api/services/integrations/whatsapp/services/whatsapp.service';
import { classifyHttpPublishError } from '@api/shared/utils/publish-error/classify-http-publish-error.util';
import { CredentialPlatform, PublishErrorKind } from '@genfeedai/contracts';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

const HTTP_UNAUTHORIZED = 401;

/** Twilio's own error code from a failed send, e.g. `21211`. */
function readTwilioErrorCode(error: unknown): string | undefined {
  if (!isRecord(error) || !isRecord(error.response)) return undefined;
  const body = error.response.data;
  const code = isRecord(body) ? body.code : undefined;
  return typeof code === 'number' || typeof code === 'string'
    ? String(code)
    : undefined;
}

/**
 * Twilio answers 401 when the sender's account credentials are refused. No
 * token of the user's is involved and nothing a refresh does can fix it, so it
 * is reported as a channel that cannot send.
 */
function twilioKindForStatus(status: number): PublishErrorKind | undefined {
  return status === HTTP_UNAUTHORIZED
    ? PublishErrorKind.CHANNEL_DISCONNECTED
    : undefined;
}

@Traced()
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
      return this.createFailedResult(
        this.platform,
        validation.error,
        validation.errorCode,
      );
    }

    try {
      const recipientNumber = credential.externalId;
      if (!recipientNumber) {
        this.logger.error(`${url} WhatsApp recipient number not found`, {
          postId: context.postId,
        });
        return {
          ...this.createFailedResult(
            this.platform,
            'WhatsApp recipient number not configured in credential',
          ),
          errorKind: PublishErrorKind.CHANNEL_DISCONNECTED,
        };
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
        // Twilio answered the send without a message SID, so the message may
        // be on its way. Report the outcome as unknown, not as a plain failure.
        return {
          ...this.createFailedResult(
            this.platform,
            'Failed to get message SID from Twilio',
          ),
          errorKind: PublishErrorKind.OUTCOME_UNKNOWN,
        };
      }

      const postUrl = this.buildPostUrl(messageSid, credential);
      return this.createSuccessResult(messageSid, this.platform, postUrl);
    } catch (error: unknown) {
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });
      throw classifyHttpPublishError(error, {
        isPublishRequest: true,
        providerCode: readTwilioErrorCode(error),
        kindForStatus: twilioKindForStatus,
      });
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
