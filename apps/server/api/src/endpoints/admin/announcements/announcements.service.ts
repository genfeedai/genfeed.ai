import { AnnouncementDocument } from '@api/collections/announcements/schemas/announcement.schema';
import { AnnouncementsService as AnnouncementsCollectionService } from '@api/collections/announcements/services/announcements.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { BroadcastAnnouncementDto } from '@api/endpoints/admin/announcements/dto/broadcast-announcement.dto';
import { getErrorMessage } from '@api/helpers/utils/error/get-error-message.util';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { REDIS_EVENTS } from '@genfeedai/integrations';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { TwitterApi } from 'twitter-api-v2';

@Injectable()
export class AdminAnnouncementsService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly announcementsCollectionService: AnnouncementsCollectionService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly redisService: RedisService,
  ) {}

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

    let discordMessageUrl: string | undefined;
    let tweetId: string | undefined;
    let tweetUrl: string | undefined;

    // --- Discord publishing via Redis pub/sub ---
    if (dto.channels.includes('discord') && dto.discordChannelId) {
      try {
        await this.redisService.publish(REDIS_EVENTS.DISCORD_SEND_TO_CHANNEL, {
          channelId: dto.discordChannelId,
          message: dto.body,
          orgId: organizationId,
        });

        this.loggerService.log(caller, {
          channelId: dto.discordChannelId,
          message: 'Discord send-to-channel event published',
          organizationId,
        });
      } catch (error) {
        this.loggerService.error(caller, {
          error: getErrorMessage(error),
          message: 'Failed to publish Discord send-to-channel event',
        });
        // Non-fatal: continue to persist the record and try other channels
      }
    }

    // --- Twitter publishing ---
    if (dto.channels.includes('twitter')) {
      try {
        const tweetResult = await this.publishToTwitter(
          organizationId,
          dto.tweetText ?? dto.body,
        );
        tweetId = tweetResult?.tweetId;
        tweetUrl = tweetResult?.tweetUrl;
      } catch (error) {
        this.loggerService.error(caller, {
          error: getErrorMessage(error),
          message: 'Failed to publish announcement to Twitter',
        });
        // Non-fatal: persist even if Twitter fails
      }
    }

    // --- Persist announcement record ---
    const announcement =
      await this.announcementsCollectionService.createAnnouncement({
        authorId,
        body: dto.body,
        channels: dto.channels,
        discordChannelId: dto.discordChannelId,
        discordMessageUrl,
        isDeleted: false,
        publishedAt: new Date(),
        tweetId,
        tweetText: dto.tweetText,
        tweetUrl,
      });

    this.loggerService.log(caller, {
      announcementId: announcement._id.toString(),
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

  // --- Private helpers ---

  private async publishToTwitter(
    organizationId: string,
    text: string,
  ): Promise<{ tweetId: string; tweetUrl: string } | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    // Find the org's Twitter credential
    const credential = await this.credentialsService.findOne({
      isConnected: true,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
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
