import type { IAgentCampaignMessage } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable } from '@nestjs/common';

const MAX_MESSAGES_PER_CAMPAIGN = 50;
const MESSAGE_TTL_SECONDS = 86400; // 24 hours

@Injectable()
export class AgentMessageBusService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Publish a message to a campaign's message bus.
   * Stores in Redis list and publishes to pub/sub channel.
   */
  async publish(message: IAgentCampaignMessage): Promise<void> {
    const channel = this.getChannel(message.campaignId);
    const listKey = this.getListKey(message.campaignId);
    const publisher = this.redisService.getPublisher();

    if (!publisher) {
      this.logger.warn(
        `${this.constructorName} Redis not available, skipping message publish`,
        { campaignId: message.campaignId },
      );
      return;
    }

    const serialized = JSON.stringify(message);

    try {
      // Store in list for history
      await publisher.rPush(listKey, serialized);
      // Trim to last N messages
      await publisher.lTrim(listKey, -MAX_MESSAGES_PER_CAMPAIGN, -1);
      // Set TTL on the list
      await publisher.expire(listKey, MESSAGE_TTL_SECONDS);

      // Publish for real-time subscribers
      await this.redisService.publish(channel, message);

      this.logger.log(
        `${this.constructorName} published message to campaign ${message.campaignId}`,
        { agentId: message.agentId, type: message.type },
      );
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} failed to publish message`,
        error,
      );
    }
  }

  /**
   * Subscribe to a campaign's message bus for real-time updates.
   */
  async subscribe(
    campaignId: string,
    handler: (message: IAgentCampaignMessage) => void,
  ): Promise<void> {
    const channel = this.getChannel(campaignId);

    await this.redisService.subscribe(channel, (rawMessage: unknown) => {
      try {
        const message = rawMessage as IAgentCampaignMessage;
        handler(message);
      } catch (error: unknown) {
        this.logger.error(
          `${this.constructorName} failed to handle message from campaign ${campaignId}`,
          error,
        );
      }
    });

    this.logger.log(
      `${this.constructorName} subscribed to campaign ${campaignId}`,
    );
  }

  /**
   * Get recent messages from a campaign's message bus.
   * Returns the last N messages stored in the Redis list.
   */
  async getRecentMessages(
    campaignId: string,
    limit = MAX_MESSAGES_PER_CAMPAIGN,
  ): Promise<IAgentCampaignMessage[]> {
    const listKey = this.getListKey(campaignId);
    const publisher = this.redisService.getPublisher();

    if (!publisher) {
      this.logger.warn(
        `${this.constructorName} Redis not available, returning empty messages`,
        { campaignId },
      );
      return [];
    }

    try {
      const raw = await publisher.lRange(listKey, -limit, -1);
      return raw.map((item) => JSON.parse(item) as IAgentCampaignMessage);
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} failed to get recent messages for campaign ${campaignId}`,
        error,
      );
      return [];
    }
  }

  private getChannel(campaignId: string): string {
    return `campaign:${campaignId}:messages`;
  }

  private getListKey(campaignId: string): string {
    return `campaign:${campaignId}:message_history`;
  }
}
