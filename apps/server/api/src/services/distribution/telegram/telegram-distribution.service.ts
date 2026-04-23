import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { DistributionsService } from '@api/collections/distributions/services/distributions.service';
import { ConfigService } from '@api/config/config.service';
import { QueueService } from '@api/queues/core/queue.service';
import type { TelegramDistributeJobData } from '@api/queues/telegram-distribute/telegram-distribute-job.interface';
import {
  CredentialPlatform,
  DistributionContentType,
  DistributionPlatform,
  ParseMode,
  PublishStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

interface TelegramSendResult {
  ok: boolean;
  result?: {
    message_id: number;
  };
  description?: string;
}

interface SendOptions {
  organizationId: string;
  userId: string;
  chatId: string;
  contentType: DistributionContentType;
  text?: string;
  mediaUrl?: string;
  caption?: string;
  brandId?: string;
  scheduledAt?: Date;
}

interface ProcessScheduledOptions {
  distributionId: string;
  organizationId: string;
  platform: DistributionPlatform;
}

@Injectable()
export class TelegramDistributionService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly distributionsService: DistributionsService,
    private readonly queueService: QueueService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {}

  async sendImmediate(
    options: SendOptions,
  ): Promise<{ distributionId: string; telegramMessageId?: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const distribution = await this.distributionsService.createDistribution(
      options.organizationId,
      options.userId,
      {
        brandId: options.brandId,
        caption: options.caption,
        chatId: options.chatId,
        contentType: options.contentType,
        mediaUrl: options.mediaUrl,
        text: options.text,
      },
      DistributionPlatform.TELEGRAM,
      PublishStatus.PUBLISHING,
    );

    try {
      const botToken = await this.resolveBotToken(
        options.organizationId,
        options.brandId,
      );

      const result = await this.sendToTelegram(
        botToken,
        options.chatId,
        options.contentType,
        options.text,
        options.mediaUrl,
        options.caption,
      );

      const telegramMessageId = result.result?.message_id?.toString();

      await this.distributionsService.markAsPublished(
        distribution._id.toString(),
        telegramMessageId,
      );

      this.loggerService.log(`${url} sent successfully`, {
        chatId: options.chatId,
        contentType: options.contentType,
        distributionId: distribution._id,
      });

      return {
        distributionId: distribution._id.toString(),
        telegramMessageId,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      await this.distributionsService.markAsFailed(
        distribution._id.toString(),
        errorMessage,
      );

      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  async schedule(
    options: SendOptions & { scheduledAt: Date },
  ): Promise<{ distributionId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const distribution = await this.distributionsService.createDistribution(
      options.organizationId,
      options.userId,
      {
        brandId: options.brandId,
        caption: options.caption,
        chatId: options.chatId,
        contentType: options.contentType,
        mediaUrl: options.mediaUrl,
        text: options.text,
      },
      DistributionPlatform.TELEGRAM,
      PublishStatus.SCHEDULED,
      options.scheduledAt,
    );

    this.loggerService.log(`${url} scheduled distribution`, {
      distributionId: distribution._id,
      scheduledAt: options.scheduledAt,
    });

    const now = Date.now();
    const scheduledAtMs = options.scheduledAt.getTime();
    const delayMs = Math.max(0, scheduledAtMs - now);
    const distributionId = distribution._id.toString();
    const queueData: TelegramDistributeJobData = {
      distributionId,
      organizationId: options.organizationId,
      platform: DistributionPlatform.TELEGRAM,
    };

    await this.queueService.add('telegram-distribute', queueData, {
      delay: delayMs,
      jobId: `telegram-distribute-${distributionId}`,
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    return { distributionId };
  }

  async processScheduled(options: ProcessScheduledOptions): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { distributionId, organizationId, platform } = options;

    const distribution = await this.distributionsService.findOne({
      _id: distributionId,
      isDeleted: false,
      organization: organizationId,
      platform,
      status: PublishStatus.SCHEDULED,
    });

    if (!distribution) {
      this.loggerService.warn(
        `${url} distribution not found or not scheduled`,
        {
          distributionId,
        },
      );
      return;
    }

    try {
      const organizationId =
        distribution.organization ?? distribution.organizationId;
      const brandId =
        distribution.brand?.toString() ?? distribution.brandId ?? undefined;
      const chatId = distribution.chatId;
      const contentType = distribution.contentType;

      if (!organizationId || !chatId || !contentType) {
        throw new Error(
          'Scheduled Telegram distribution is missing required delivery config',
        );
      }

      await this.distributionsService.patch(distribution._id, {
        status: PublishStatus.PUBLISHING,
      });

      const botToken = await this.resolveBotToken(organizationId, brandId);

      const result = await this.sendToTelegram(
        botToken,
        chatId,
        contentType as DistributionContentType,
        distribution.text,
        distribution.mediaUrl,
        distribution.caption,
      );

      const telegramMessageId = result.result?.message_id?.toString();

      await this.distributionsService.markAsPublished(
        distribution._id.toString(),
        telegramMessageId,
      );

      this.loggerService.log(`${url} processed scheduled distribution`, {
        distributionId,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      await this.distributionsService.markAsFailed(
        distribution._id.toString(),
        errorMessage,
      );

      this.loggerService.error(
        `${url} failed to process scheduled distribution`,
        error,
      );
      throw error;
    }
  }

  private async resolveBotToken(
    organizationId: string,
    brandId?: string,
  ): Promise<string> {
    // Try org-specific credential first (brand-scoped token)
    if (brandId) {
      const credential = await this.credentialsService.findOne({
        brand: brandId,
        isConnected: true,
        isDeleted: false,
        organization: organizationId,
        platform: CredentialPlatform.TELEGRAM,
      });

      if (credential?.accessToken) {
        return credential.accessToken;
      }
    }

    // Fall back to org-level credential
    const orgCredential = await this.credentialsService.findOne({
      isConnected: true,
      isDeleted: false,
      organization: organizationId,
      platform: CredentialPlatform.TELEGRAM,
    });

    if (orgCredential?.accessToken) {
      return orgCredential.accessToken;
    }

    // Fall back to global bot token from config
    const globalToken = this.configService.get('TELEGRAM_BOT_TOKEN');
    if (globalToken) {
      return globalToken;
    }

    throw new Error(
      'No Telegram bot token found. Connect a Telegram bot in settings.',
    );
  }

  private sendToTelegram(
    botToken: string,
    chatId: string,
    contentType: DistributionContentType,
    text?: string,
    mediaUrl?: string,
    caption?: string,
  ): Promise<TelegramSendResult> {
    const baseUrl = `https://api.telegram.org/bot${botToken}`;

    switch (contentType) {
      case DistributionContentType.TEXT:
        return this.sendText(baseUrl, chatId, text || '');

      case DistributionContentType.PHOTO:
        return this.sendPhoto(baseUrl, chatId, mediaUrl || '', caption);

      case DistributionContentType.VIDEO:
        return this.sendVideo(baseUrl, chatId, mediaUrl || '', caption);

      default:
        throw new Error(`Unsupported content type: ${contentType}`);
    }
  }

  private async sendText(
    baseUrl: string,
    chatId: string,
    text: string,
  ): Promise<TelegramSendResult> {
    const response = await firstValueFrom(
      this.httpService.post<TelegramSendResult>(
        `${baseUrl}/sendMessage`,
        {
          chat_id: chatId,
          parse_mode: ParseMode.HTML,
          text,
        },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    return response.data;
  }

  private async sendPhoto(
    baseUrl: string,
    chatId: string,
    photoUrl: string,
    caption?: string,
  ): Promise<TelegramSendResult> {
    const response = await firstValueFrom(
      this.httpService.post<TelegramSendResult>(
        `${baseUrl}/sendPhoto`,
        {
          caption,
          chat_id: chatId,
          parse_mode: ParseMode.HTML,
          photo: photoUrl,
        },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    return response.data;
  }

  private async sendVideo(
    baseUrl: string,
    chatId: string,
    videoUrl: string,
    caption?: string,
  ): Promise<TelegramSendResult> {
    const response = await firstValueFrom(
      this.httpService.post<TelegramSendResult>(
        `${baseUrl}/sendVideo`,
        {
          caption,
          chat_id: chatId,
          parse_mode: ParseMode.HTML,
          video: videoUrl,
        },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    return response.data;
  }
}
