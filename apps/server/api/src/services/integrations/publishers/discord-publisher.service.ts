import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import {
  DiscordApiError,
  type DiscordWebhookFile,
  DiscordWebhookService,
} from '@api/services/integrations/discord/services/discord-webhook.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { CredentialPlatform } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

/** Discord's default upload limit for one file. */
const DISCORD_MAX_FILE_BYTES = 20 * 1024 * 1024;

/** `<webhook id>/<webhook token>`, as stored at connect. */
const WEBHOOK_PATH_PATTERN = /^\d+\/[\w-]+$/;

const FILE_EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

class FileTooLargeError extends Error {
  constructor() {
    super('A media file is larger than the 20 MB Discord accepts');
    this.name = 'FileTooLargeError';
  }
}

@Traced()
@Injectable()
export class DiscordPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.DISCORD;
  readonly supportsTextOnly = true;
  readonly supportsImages = true;
  readonly supportsVideos = true;
  readonly supportsCarousel = true;
  readonly supportsThreads = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly discordWebhook: DiscordWebhookService,
    private readonly credentialsService: CredentialsService,
    private readonly httpService: HttpService,
  ) {
    super(configService, logger);
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

    const webhookPath = credential?.accessToken
      ? EncryptionUtil.decrypt(credential.accessToken)
      : undefined;
    // A Discord account connected before posting was supported holds a user
    // sign-in token, not a channel webhook.
    if (!webhookPath || !WEBHOOK_PATH_PATTERN.test(webhookPath)) {
      return this.createFailedResult(
        this.platform,
        'This Discord connection cannot post. Reconnect Discord and choose a channel.',
        'channel_not_connected',
      );
    }

    try {
      const files = await this.downloadFiles(mediaInfo.mediaUrls);
      const { channelId, messageId } = await this.discordWebhook.execute(
        webhookPath,
        { content: this.sanitizeDescription(post.description), files },
      );
      return this.createSuccessResult(
        messageId,
        this.platform,
        this.buildMessageUrl(messageId, credential, channelId),
      );
    } catch (error: unknown) {
      if (error instanceof FileTooLargeError) {
        return this.createFailedResult(
          this.platform,
          error.message,
          'file_too_large',
        );
      }
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });
      if (error instanceof DiscordApiError && error.kind === 'webhook_gone') {
        await this.credentialsService.patch(credential.id, {
          isConnected: false,
        });
      }
      throw error;
    }
  }

  buildPostUrl(
    externalId: string,
    credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    return this.buildMessageUrl(externalId, credential);
  }

  /** The credential identity is `<server id>:<channel id>`. */
  private buildMessageUrl(
    messageId: string,
    credential: CredentialDocument,
    channelId?: string,
  ): string {
    const [guildId, credentialChannelId] = (credential.externalId ?? '').split(
      ':',
    );
    const channel = channelId ?? credentialChannelId;
    return guildId && channel
      ? `https://discord.com/channels/${guildId}/${channel}/${messageId}`
      : '';
  }

  private async downloadFiles(
    mediaUrls: string[],
  ): Promise<DiscordWebhookFile[]> {
    const files: DiscordWebhookFile[] = [];
    for (const [index, mediaUrl] of mediaUrls.entries()) {
      const response = await firstValueFrom(
        this.httpService.get<ArrayBuffer>(mediaUrl, {
          maxContentLength: DISCORD_MAX_FILE_BYTES,
          responseType: 'arraybuffer',
        }),
      );
      const bytes = new Uint8Array(response.data);
      if (bytes.byteLength > DISCORD_MAX_FILE_BYTES) {
        throw new FileTooLargeError();
      }
      const contentType = String(
        response.headers?.['content-type'] ?? 'application/octet-stream',
      ).split(';')[0];
      files.push({
        bytes,
        contentType,
        filename: `media-${index + 1}.${FILE_EXTENSION_BY_CONTENT_TYPE[contentType] ?? 'bin'}`,
      });
    }
    return files;
  }
}
