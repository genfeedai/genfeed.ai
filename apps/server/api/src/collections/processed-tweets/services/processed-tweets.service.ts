import {
  ProcessedTweet,
  type ProcessedTweetDocument,
} from '@api/collections/processed-tweets/schemas/processed-tweet.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { ReplyBotType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class ProcessedTweetsService extends BaseService<
  ProcessedTweetDocument,
  Partial<ProcessedTweet>,
  Partial<ProcessedTweet>
> {
  constructor(
    @InjectModel(ProcessedTweet.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<ProcessedTweetDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  /**
   * Check if a tweet has already been processed
   */
  async isProcessed(
    tweetId: string,
    organizationId: string,
    processedBy: ReplyBotType,
  ): Promise<boolean> {
    const existing = await this.findOne({
      organization: new Types.ObjectId(organizationId),
      processedBy,
      tweetId,
    });

    return !!existing;
  }

  /**
   * Mark a tweet as processed
   */
  async markAsProcessed(
    tweetId: string,
    organizationId: string,
    processedBy: ReplyBotType,
    replyBotConfigId?: string,
    botActivityId?: string,
  ): Promise<ProcessedTweetDocument> {
    const data: Partial<ProcessedTweet> = {
      organization: new Types.ObjectId(organizationId),
      processedAt: new Date(),
      processedBy,
      tweetId,
    };

    if (replyBotConfigId) {
      data.replyBotConfig = new Types.ObjectId(replyBotConfigId);
    }

    if (botActivityId) {
      data.botActivity = new Types.ObjectId(botActivityId);
    }

    try {
      return await this.create(data);
    } catch (error: unknown) {
      // Handle duplicate key error (tweet already processed)
      if ((error as { code?: number })?.code === 11000) {
        const existing = await this.findOne({
          organization: new Types.ObjectId(organizationId),
          processedBy,
          tweetId,
        });
        if (!existing) {
          throw new Error(
            `Failed to find existing processed tweet after duplicate key error: ${tweetId}`,
          );
        }
        return existing;
      }
      throw error;
    }
  }

  /**
   * Bulk check if tweets have been processed
   * Returns a Set of tweet IDs that have been processed
   */
  async getProcessedTweetIds(
    tweetIds: string[],
    organizationId: string,
    processedBy: ReplyBotType,
  ): Promise<Set<string>> {
    const processed = await this.find({
      organization: new Types.ObjectId(organizationId),
      processedBy,
      tweetId: { $in: tweetIds },
    });

    return new Set(processed.map((p) => p.tweetId));
  }

  /**
   * Clean up old processed tweets (beyond TTL)
   * Note: MongoDB TTL index should handle this automatically,
   * but this can be used for manual cleanup if needed
   */
  async cleanupOldRecords(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.model.deleteMany({
      processedAt: { $lt: cutoffDate },
    });

    return result.deletedCount;
  }
}
