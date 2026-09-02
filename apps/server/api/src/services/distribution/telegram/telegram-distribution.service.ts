import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { DistributionsService } from '@api/collections/distributions/services/distributions.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  buildTelegramDistributionWorkflowDefinition,
  TELEGRAM_DISTRIBUTION_ACTION_IDS,
} from '@api/services/distribution/telegram/telegram-distribution-workflow-definition';
import {
  CredentialPlatform,
  DistributionContentType,
  DistributionPlatform,
  ParseMode,
  PublishStatus,
} from '@genfeedai/enums';
import type { TelegramDistributionWorkflowInput } from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable, type OnModuleInit } from '@nestjs/common';
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
  /** Which of the brand's Telegram accounts sends this. */
  credentialId?: string;
  scheduledAt?: Date;
}

interface ProcessScheduledOptions {
  distributionId: string;
  organizationId: string;
  platform: DistributionPlatform;
}

interface TelegramDeliveryContext {
  brandId?: string;
  caption?: string;
  chatId: string;
  contentType: DistributionContentType;
  credentialId?: string;
  distributionId: string;
  mediaUrl?: string;
  organizationId: string;
  skipped?: boolean;
  text?: string;
}

@Injectable()
export class TelegramDistributionService implements OnModuleInit {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly distributionsService: DistributionsService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      TELEGRAM_DISTRIBUTION_ACTION_IDS.CLAIM,
      ({ input }) =>
        this.claimScheduled(input.request as TelegramDistributionWorkflowInput),
    );
    this.workflowRunner.registerAction(
      TELEGRAM_DISTRIBUTION_ACTION_IDS.RESOLVE_CREDENTIAL,
      ({ input }) =>
        this.resolveScheduledCredential(
          input.delivery as TelegramDeliveryContext,
        ),
    );
    this.workflowRunner.registerAction(
      TELEGRAM_DISTRIBUTION_ACTION_IDS.SEND,
      ({ input }) =>
        this.sendScheduled(
          input.delivery as TelegramDeliveryContext,
          input.credential as { ready?: boolean },
        ),
    );
    this.workflowRunner.registerAction(
      TELEGRAM_DISTRIBUTION_ACTION_IDS.FINALIZE,
      ({ input }) => this.finalizeScheduled(input),
    );
    this.workflowRunner.registerWorkflow(
      buildTelegramDistributionWorkflowDefinition(),
    );
  }

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
        credentialId: options.credentialId,
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
        options.credentialId,
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
        distribution.id.toString(),
        telegramMessageId,
      );

      this.loggerService.log(`${url} sent successfully`, {
        chatId: options.chatId,
        contentType: options.contentType,
        distributionId: distribution.id,
      });

      return {
        distributionId: distribution.id.toString(),
        ...(telegramMessageId === undefined ? {} : { telegramMessageId }),
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      await this.distributionsService.markAsFailed(
        distribution.id.toString(),
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
        credentialId: options.credentialId,
        mediaUrl: options.mediaUrl,
        text: options.text,
      },
      DistributionPlatform.TELEGRAM,
      PublishStatus.SCHEDULED,
      options.scheduledAt,
    );

    this.loggerService.log(`${url} scheduled distribution`, {
      distributionId: distribution.id,
      scheduledAt: options.scheduledAt,
    });

    const now = Date.now();
    const scheduledAtMs = options.scheduledAt.getTime();
    const delayMs = Math.max(0, scheduledAtMs - now);
    const distributionId = distribution.id.toString();
    const request: TelegramDistributionWorkflowInput = {
      distributionId,
      organizationId: options.organizationId,
      platform: DistributionPlatform.TELEGRAM,
    };

    const definition = buildTelegramDistributionWorkflowDefinition();
    await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request },
        organizationId: options.organizationId,
        source: 'telegram-schedule',
        userId: options.userId,
      },
      `telegram-distribute-${distributionId}`,
      { attempts: 3, delayMs, replaceTerminalJob: true },
    );

    return { distributionId };
  }

  private async claimScheduled(
    options: ProcessScheduledOptions,
  ): Promise<TelegramDeliveryContext> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { distributionId, organizationId, platform } = options;

    const distribution = await this.distributionsService.findOne({
      id: distributionId,
      organizationId: organizationId,
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
      return {
        chatId: '',
        contentType: DistributionContentType.TEXT,
        distributionId,
        organizationId,
        skipped: true,
      };
    }

    const deliveryOrganizationId = distribution.organizationId;
    const brandId = distribution.brandId ?? undefined;
    // Which account was chosen when the send was scheduled — a brand may
    // hold several Telegram bots, and the schedule picked one of them.
    const credentialId = distribution.credentialId;
    const chatId = distribution.chatId;
    const contentType = distribution.contentType;

    if (!deliveryOrganizationId || !chatId || !contentType) {
      throw new Error(
        'Scheduled Telegram distribution is missing required delivery config',
      );
    }

    await this.distributionsService.patch(distribution.id, {
      status: PublishStatus.PUBLISHING,
    });

    return {
      ...(brandId === undefined ? {} : { brandId }),
      ...(distribution.caption === undefined || distribution.caption === null
        ? {}
        : { caption: distribution.caption }),
      chatId,
      contentType: contentType as DistributionContentType,
      ...(credentialId === undefined || credentialId === null
        ? {}
        : { credentialId }),
      distributionId: distribution.id.toString(),
      ...(distribution.mediaUrl === undefined || distribution.mediaUrl === null
        ? {}
        : { mediaUrl: distribution.mediaUrl }),
      organizationId: deliveryOrganizationId,
      ...(distribution.text === undefined || distribution.text === null
        ? {}
        : { text: distribution.text }),
    };
  }

  private async resolveScheduledCredential(
    delivery: TelegramDeliveryContext,
  ): Promise<{ ready?: boolean }> {
    if (delivery.skipped) return {};
    await this.resolveBotToken(
      delivery.organizationId,
      delivery.brandId,
      delivery.credentialId,
    );
    return { ready: true };
  }

  private async sendScheduled(
    delivery: TelegramDeliveryContext,
    credential: { ready?: boolean },
  ): Promise<{ skipped?: boolean; telegramMessageId?: string }> {
    if (delivery.skipped) return { skipped: true };
    if (!credential.ready) throw new Error('Telegram credential is missing');
    const botToken = await this.resolveBotToken(
      delivery.organizationId,
      delivery.brandId,
      delivery.credentialId,
    );
    const result = await this.sendToTelegram(
      botToken,
      delivery.chatId,
      delivery.contentType,
      delivery.text,
      delivery.mediaUrl,
      delivery.caption,
    );
    const telegramMessageId = result.result?.message_id?.toString();
    return telegramMessageId === undefined ? {} : { telegramMessageId };
  }

  private async finalizeScheduled(
    input: Record<string, unknown>,
  ): Promise<{ delivered: boolean }> {
    const delivery = input.delivery as TelegramDeliveryContext | undefined;
    if (!delivery || delivery.skipped) return { delivered: false };
    const failure = input.failure as { error?: string } | undefined;
    if (failure) {
      await this.distributionsService.markAsFailed(
        delivery.distributionId,
        failure.error ?? 'Unknown error',
      );
      return { delivered: false };
    }
    const result = input.result as { telegramMessageId?: string } | undefined;
    await this.distributionsService.markAsPublished(
      delivery.distributionId,
      result?.telegramMessageId,
    );
    this.loggerService.log('Processed scheduled Telegram distribution', {
      distributionId: delivery.distributionId,
    });
    return { delivered: true };
  }

  private async resolveBotToken(
    organizationId: string,
    brandId?: string,
    credentialId?: string,
  ): Promise<string> {
    if (credentialId && !brandId) {
      throw new Error(
        'A brand is required when selecting a Telegram credential',
      );
    }

    if (brandId) {
      const credential = await this.credentialsService.resolveBrandAccount({
        brandId,
        credentialId,
        organizationId,
        platform: CredentialPlatform.TELEGRAM,
      });

      if (credential?.accessToken) {
        return EncryptionUtil.decrypt(credential.accessToken);
      }

      throw new Error('Telegram credential not found for this brand');
    }

    // Fall back to org-level credential
    const orgCredential = await this.credentialsService.findOne({
      isConnected: true,
      organizationId: organizationId,
      platform: CredentialPlatform.TELEGRAM,
    });

    if (orgCredential?.accessToken) {
      return EncryptionUtil.decrypt(orgCredential.accessToken);
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
