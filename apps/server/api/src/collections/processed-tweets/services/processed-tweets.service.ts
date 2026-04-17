import type {
  ProcessedTweet,
  ProcessedTweetDocument,
} from '@api/collections/processed-tweets/schemas/processed-tweet.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { ReplyBotType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ProcessedTweetsService extends BaseService<
  ProcessedTweetDocument,
  Partial<ProcessedTweet>,
  Partial<ProcessedTweet>
> {
  constructor(
    public readonly prisma: PrismaService,
    readonly logger: LoggerService,
  ) {
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
  }

  /**
   * Check if a tweet has already been processed
   */
  async isProcessed(
    tweetId: string,
    organizationId: string,
    processedBy: ReplyBotType,
  ): Promise<boolean> {
    const existing = await this.prisma.processedTweet.findFirst({
      where: { organizationId, processedBy, tweetId },
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
    const data: Record<string, unknown> = {
      organizationId,
      processedAt: new Date(),
      processedBy,
      tweetId,
    };

    if (replyBotConfigId) {
      data.replyBotConfigId = replyBotConfigId;
    }

    if (botActivityId) {
      data.botActivityId = botActivityId;
    }

    try {
      const result = await this.prisma.processedTweet.create({
        data: data as never,
      });
      return result as unknown as ProcessedTweetDocument;
    } catch (error: unknown) {
      // Handle duplicate key error (tweet already processed)
      if ((error as { code?: number })?.code === 'P2002') {
        const existing = await this.prisma.processedTweet.findFirst({
          where: { organizationId, processedBy, tweetId },
        });
        if (!existing) {
          throw new Error(
            `Failed to find existing processed tweet after duplicate key error: ${tweetId}`,
          );
        }
        return existing as unknown as ProcessedTweetDocument;
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
    const processed = await this.prisma.processedTweet.findMany({
      where: { organizationId, processedBy, tweetId: { in: tweetIds } },
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

    const result = await this.prisma.processedTweet.deleteMany({
      where: { processedAt: { lt: cutoffDate } },
    });

    return result.count;
  }
}
