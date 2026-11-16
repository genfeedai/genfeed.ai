import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import { toChatPublishError } from '@api/services/integrations/publishers/chat-publish-error.util';
import type {
  MediaInfo,
  PostValidationResult,
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import {
  TelegramApiError,
  TelegramBotApiService,
} from '@api/services/integrations/telegram/services/telegram-bot-api.service';
import {
  CredentialPlatform,
  DistributionContentType,
} from '@genfeedai/contracts';
import { readChannelSettingString } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Injectable } from '@nestjs/common';

/** Telegram caps the caption of a photo or video at 1024 characters. */
const TELEGRAM_MEDIA_CAPTION_MAX_LENGTH = 1_024;
const LEADING_AT_SIGN_PATTERN = /^@/;
const SUPERGROUP_ID_PREFIX_PATTERN = /^-100(\d+)$/;

/** Telegram HTML mode needs `&`, `<` and `>` written as entities. */
function escapeTelegramHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * Link to a sent message. A public channel (`@name`) has a stable address; a
 * numeric supergroup or channel id maps to the `t.me/c/` form. Other chats
 * (private groups, direct chats) have no shareable link.
 */
function buildTelegramMessageUrl(chatId: string, messageId: string): string {
  if (chatId.startsWith('@')) {
    return `https://t.me/${chatId.replace(LEADING_AT_SIGN_PATTERN, '')}/${messageId}`;
  }
  const supergroup = SUPERGROUP_ID_PREFIX_PATTERN.exec(chatId);
  return supergroup ? `https://t.me/c/${supergroup[1]}/${messageId}` : '';
}

@Traced()
@Injectable()
export class TelegramPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.TELEGRAM;
  readonly supportsTextOnly = true;
  readonly supportsImages = true;
  readonly supportsVideos = true;
  readonly supportsCarousel = false;
  readonly supportsThreads = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly telegramBotApi: TelegramBotApiService,
    private readonly credentialsService: CredentialsService,
  ) {
    super(configService, logger);
  }

  override validatePost(
    context: PublishContext,
    mediaInfo: MediaInfo,
  ): PostValidationResult {
    const baseValidation = super.validatePost(context, mediaInfo);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    if (mediaInfo.ingredientIds.length > 1) {
      return {
        error: 'Telegram posts take one photo or video',
        errorCode: 'too_many_media',
        valid: false,
      };
    }

    if (mediaInfo.hasIngredients) {
      const captionLength = [
        ...this.sanitizeDescription(context.post.description),
      ].length;
      if (captionLength > TELEGRAM_MEDIA_CAPTION_MAX_LENGTH) {
        return {
          error: `A Telegram photo or video caption is ${captionLength} characters; the limit is ${TELEGRAM_MEDIA_CAPTION_MAX_LENGTH} characters.`,
          errorCode: 'caption_too_long',
          valid: false,
        };
      }
    }

    return { valid: true };
  }

  async publish(context: PublishContext): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { credential, post } = context;
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

    const chatId = readChannelSettingString(context.settings, 'chatId');
    if (!chatId) {
      return this.createFailedResult(
        this.platform,
        'Telegram requires the chat to post to',
        'chat_required',
      );
    }

    if (!credential?.accessToken) {
      return this.createFailedResult(
        this.platform,
        'Telegram bot token not found',
        'credential_missing',
      );
    }

    const text = escapeTelegramHtml(this.sanitizeDescription(post.description));
    const mediaUrl = mediaInfo.mediaUrls[0];
    const contentType = !mediaUrl
      ? DistributionContentType.TEXT
      : mediaInfo.isImagePost
        ? DistributionContentType.PHOTO
        : DistributionContentType.VIDEO;

    try {
      const { messageId } = await this.telegramBotApi.send(
        EncryptionUtil.decrypt(credential.accessToken),
        {
          ...(mediaUrl ? { caption: text, mediaUrl } : { text }),
          chatId,
          contentType,
        },
      );
      return this.createSuccessResult(
        messageId,
        this.platform,
        buildTelegramMessageUrl(chatId, messageId),
      );
    } catch (error: unknown) {
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });
      if (error instanceof TelegramApiError) {
        if (error.kind === 'token_invalid' || error.kind === 'bot_removed') {
          await this.credentialsService.patch(credential.id, {
            isConnected: false,
          });
        }
        throw toChatPublishError(error);
      }
      throw error;
    }
  }

  /**
   * The Bot API cannot look a sent message up by id, and the message does not
   * carry the chat, so the link is built at publish time from the chat setting.
   */
  buildPostUrl(
    _externalId: string,
    _credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    return '';
  }
}
