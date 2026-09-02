import type { AnnouncementDocument } from '@api/collections/announcements/schemas/announcement.schema';
import { AnnouncementsService as AnnouncementsCollectionService } from '@api/collections/announcements/services/announcements.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  ANNOUNCEMENT_BROADCAST_ACTION_IDS,
  ANNOUNCEMENT_BROADCAST_WORKFLOW_ID,
  buildAnnouncementBroadcastWorkflowDefinition,
} from '@api/endpoints/admin/announcements/announcement-broadcast-workflow-definition';
import {
  type AnnouncementChannel,
  BroadcastAnnouncementDto,
} from '@api/endpoints/admin/announcements/dto/broadcast-announcement.dto';
import {
  CredentialPlatform,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import { REDIS_EVENTS } from '@genfeedai/integrations';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import {
  BadRequestException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';
import { TwitterApi } from 'twitter-api-v2';

type AnnouncementBroadcastRequest = {
  authorId: string;
  body: string;
  channels: AnnouncementChannel[];
  discordChannelId?: string;
  organizationId: string;
  tweetText?: string;
};

type AnnouncementDeliveryResult = {
  attempted: boolean;
  delivered: boolean;
  error?: string;
  tweetId?: string;
  tweetUrl?: string;
};

@Injectable()
export class AdminAnnouncementsService implements OnModuleInit {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly announcementsCollectionService: AnnouncementsCollectionService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly redisService: RedisService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      ANNOUNCEMENT_BROADCAST_ACTION_IDS.PUBLISH_DISCORD,
      ({ input }) => this.publishToDiscordAction(input),
    );
    this.workflowRunner.registerAction(
      ANNOUNCEMENT_BROADCAST_ACTION_IDS.PUBLISH_TWITTER,
      ({ input }) => this.publishToTwitterAction(input),
    );
    this.workflowRunner.registerAction(
      ANNOUNCEMENT_BROADCAST_ACTION_IDS.PERSIST,
      ({ input }) => this.persistAnnouncementAction(input),
    );
    this.workflowRunner.registerWorkflow(
      buildAnnouncementBroadcastWorkflowDefinition(),
    );
  }

  /**
   * Broadcast an announcement to the specified channels and persist the record.
   */
  async broadcast(
    authorId: string,
    organizationId: string,
    dto: BroadcastAnnouncementDto,
  ): Promise<AnnouncementDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.loggerService.log(caller, {
      authorId,
      channels: dto.channels,
      organizationId,
    });

    // Validate: discord channel required when discord is in channels
    if (dto.channels.includes('discord') && !dto.discordChannelId) {
      throw new BadRequestException(
        'discordChannelId is required when "discord" is in channels',
      );
    }

    const request: AnnouncementBroadcastRequest = {
      authorId,
      body: dto.body,
      channels: dto.channels,
      ...(dto.discordChannelId
        ? { discordChannelId: dto.discordChannelId }
        : {}),
      organizationId,
      ...(dto.tweetText ? { tweetText: dto.tweetText } : {}),
    };
    const { result } = await this.workflowRunner.runWorkflow<{
      announcementId: string;
    }>({
      actionType: ANNOUNCEMENT_BROADCAST_WORKFLOW_ID,
      canonicalId: ANNOUNCEMENT_BROADCAST_WORKFLOW_ID,
      inputValues: { request },
      organizationId,
      source: 'AdminAnnouncementsService.broadcast',
      trigger: WorkflowExecutionTrigger.API,
      userId: authorId,
    });
    const announcement = await this.announcementsCollectionService.findOne({
      id: result.announcementId,
    });
    if (!announcement) {
      throw new Error(
        `Announcement workflow did not persist ${result.announcementId}`,
      );
    }

    this.loggerService.log(caller, {
      announcementId: announcement.id,
      message: 'Announcement persisted',
    });

    return announcement;
  }

  /**
   * Get all announcements ordered by newest first.
   */
  getHistory(): Promise<AnnouncementDocument[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller);

    return this.announcementsCollectionService.getAll();
  }

  private async publishToDiscordAction(
    input: Record<string, unknown>,
  ): Promise<AnnouncementDeliveryResult> {
    const request = this.readActionRequest(input);
    if (!request.channels.includes('discord')) {
      return { attempted: false, delivered: false };
    }
    if (!request.discordChannelId) {
      return {
        attempted: true,
        delivered: false,
        error: 'Discord channel is required',
      };
    }

    try {
      await this.redisService.publish(REDIS_EVENTS.DISCORD_SEND_TO_CHANNEL, {
        channelId: request.discordChannelId,
        message: request.body,
        orgId: request.organizationId,
      });
      return { attempted: true, delivered: true };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.loggerService.error('Announcement Discord action failed', {
        error: message,
        organizationId: request.organizationId,
      });
      return { attempted: true, delivered: false, error: message };
    }
  }

  private async publishToTwitterAction(
    input: Record<string, unknown>,
  ): Promise<AnnouncementDeliveryResult> {
    const request = this.readActionRequest(input);
    if (!request.channels.includes('twitter')) {
      return { attempted: false, delivered: false };
    }

    try {
      const result = await this.publishToTwitter(
        request.organizationId,
        request.tweetText ?? request.body,
      );
      return result
        ? { attempted: true, delivered: true, ...result }
        : {
            attempted: true,
            delivered: false,
            error: 'Twitter credential or response unavailable',
          };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.loggerService.error('Announcement Twitter action failed', {
        error: message,
        organizationId: request.organizationId,
      });
      return { attempted: true, delivered: false, error: message };
    }
  }

  private async persistAnnouncementAction(
    input: Record<string, unknown>,
  ): Promise<{ announcementId: string }> {
    const request = this.readActionRequest(input);
    const discord = this.readRecord(input.discord);
    const twitter = this.readRecord(input.twitter);
    const tweetId = this.optionalString(twitter.tweetId);
    const tweetUrl = this.optionalString(twitter.tweetUrl);
    const announcement =
      await this.announcementsCollectionService.createAnnouncement({
        config: {
          authorId: request.authorId,
          channels: request.channels,
          ...(request.discordChannelId
            ? { discordChannelId: request.discordChannelId }
            : {}),
          discordDelivered: discord.delivered === true,
          publishedAt: new Date().toISOString(),
          ...(tweetId ? { tweetId } : {}),
          ...(request.tweetText ? { tweetText: request.tweetText } : {}),
          ...(tweetUrl ? { tweetUrl } : {}),
          twitterDelivered: twitter.delivered === true,
        },
        content: request.body,
        isDeleted: false,
        organizationId: request.organizationId,
      });
    return { announcementId: String(announcement.id) };
  }

  private readActionRequest(
    input: Record<string, unknown>,
  ): AnnouncementBroadcastRequest {
    const request = this.readRecord(input.request);
    const channels = Array.isArray(request.channels)
      ? request.channels.filter(
          (channel): channel is AnnouncementChannel =>
            channel === 'discord' || channel === 'twitter',
        )
      : [];
    return {
      authorId: this.requiredString(request.authorId, 'request.authorId'),
      body: this.requiredString(request.body, 'request.body'),
      channels,
      ...(this.optionalString(request.discordChannelId)
        ? { discordChannelId: String(request.discordChannelId) }
        : {}),
      organizationId: this.requiredString(
        request.organizationId,
        'request.organizationId',
      ),
      ...(this.optionalString(request.tweetText)
        ? { tweetText: String(request.tweetText) }
        : {}),
    };
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private requiredString(value: unknown, field: string): string {
    const parsed = this.optionalString(value);
    if (!parsed) {
      throw new Error(`Announcement workflow requires ${field}`);
    }
    return parsed;
  }

  private async publishToTwitter(
    organizationId: string,
    text: string,
  ): Promise<{ tweetId: string; tweetUrl: string } | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    // Find the org's Twitter credential
    const credential = await this.credentialsService.findOne({
      isConnected: true,
      organizationId: organizationId,
      platform: CredentialPlatform.TWITTER,
    });

    if (!credential?.accessToken) {
      this.loggerService.warn(
        `${caller} No Twitter credential found for organization ${organizationId}`,
      );
      return null;
    }

    const decryptedToken = EncryptionUtil.decrypt(credential.accessToken);
    const client = new TwitterApi(decryptedToken);

    const tweetRes = await client.v2.tweet(text);
    const tweetId = tweetRes?.data?.id;

    if (!tweetId) {
      return null;
    }

    const handle = credential.externalHandle ?? 'i';
    const cleanHandle = handle.replace(/^@/, '');
    const tweetUrl = `https://x.com/${cleanHandle}/status/${tweetId}`;

    return { tweetId, tweetUrl };
  }
}
