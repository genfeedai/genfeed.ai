import { BotActivitiesQueryDto } from '@api/collections/bot-activities/dto/bot-activities-query.dto';
import type {
  BotActivity,
  BotActivityDocument,
} from '@api/collections/bot-activities/schemas/bot-activity.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { BotActivityStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface BotActivityStats {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  pending: number;
  totalReplies: number;
  totalDms: number;
}

@Injectable()
export class BotActivitiesService extends BaseService<
  BotActivityDocument,
  Partial<BotActivity>,
  Partial<BotActivity>
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'botActivity', logger);
  }

  /**
   * Find activities with filters and pagination
   */
  async findWithFilters(
    organizationId: string,
    brandId: string | undefined,
    query: BotActivitiesQueryDto,
  ): Promise<{ activities: BotActivityDocument[]; total: number }> {
    const where: Record<string, unknown> = {
      ...(brandId ? { brandId } : {}),
      isDeleted: false,
      organizationId,
    };

    if (query.replyBotConfig) {
      where.replyBotConfigId = query.replyBotConfig;
    }

    if (query.monitoredAccount) {
      where.monitoredAccountId = query.monitoredAccount;
    }

    if (query.botType) {
      where.botType = query.botType;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) {
        (where.createdAt as Record<string, unknown>).gte = new Date(
          query.fromDate,
        );
      }
      if (query.toDate) {
        (where.createdAt as Record<string, unknown>).lte = new Date(
          query.toDate,
        );
      }
    }

    const limit = query.limit || 20;
    const offset = query.offset || 0;

    const [activities, total] = await Promise.all([
      this.delegate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }) as Promise<BotActivityDocument[]>,
      this.delegate.count({ where }) as Promise<number>,
    ]);

    return { activities, total };
  }

  /**
   * Get aggregated statistics for an organization
   */
  async getStats(
    organizationId: string,
    brandId: string | undefined,
    replyBotConfigId?: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<BotActivityStats> {
    const where: Record<string, unknown> = {
      ...(brandId ? { brandId } : {}),
      isDeleted: false,
      organizationId,
    };

    if (replyBotConfigId) {
      where.replyBotConfigId = replyBotConfigId;
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        (where.createdAt as Record<string, unknown>).gte = fromDate;
      }
      if (toDate) {
        (where.createdAt as Record<string, unknown>).lte = toDate;
      }
    }

    const [total, completed, failed, pending, skipped, totalReplies, totalDms] =
      await Promise.all([
        this.delegate.count({ where }) as Promise<number>,
        this.delegate.count({
          where: { ...where, status: BotActivityStatus.COMPLETED },
        }) as Promise<number>,
        this.delegate.count({
          where: { ...where, status: BotActivityStatus.FAILED },
        }) as Promise<number>,
        this.delegate.count({
          where: { ...where, status: BotActivityStatus.PENDING },
        }) as Promise<number>,
        this.delegate.count({
          where: { ...where, status: BotActivityStatus.SKIPPED },
        }) as Promise<number>,
        this.delegate.count({
          where: { ...where, replyTweetId: { not: null } },
        }) as Promise<number>,
        this.delegate.count({
          where: { ...where, dmSent: true },
        }) as Promise<number>,
      ]);

    return {
      completed,
      failed,
      pending,
      skipped,
      total,
      totalDms,
      totalReplies,
    };
  }

  /**
   * Mark activity as processing
   */
  markProcessing(id: string): Promise<BotActivityDocument> {
    return this.patch(id, {
      status: BotActivityStatus.PROCESSING,
    } as Partial<BotActivity>);
  }

  /**
   * Mark activity as completed with reply info
   */
  markCompleted(
    id: string,
    replyTweetId: string,
    replyTweetText: string,
    replyTweetUrl?: string,
    dmSent?: boolean,
    dmText?: string,
  ): Promise<BotActivityDocument> {
    const updateData: Partial<BotActivity> = {
      processedAt: new Date(),
      replyTweetId,
      replyTweetText,
      replyTweetUrl,
      status: BotActivityStatus.COMPLETED,
    };

    if (dmSent !== undefined) {
      updateData.dmSent = dmSent;
    }

    if (dmText) {
      updateData.dmText = dmText;
    }

    return this.patch(id, updateData);
  }

  /**
   * Mark activity as failed
   */
  markFailed(
    id: string,
    errorMessage: string,
    errorDetails?: Record<string, unknown>,
  ): Promise<BotActivityDocument> {
    return this.patch(id, {
      errorDetails,
      errorMessage,
      processedAt: new Date(),
      status: BotActivityStatus.FAILED,
    } as Partial<BotActivity>);
  }

  /**
   * Mark activity as skipped
   */
  markSkipped(id: string, skipReason: string): Promise<BotActivityDocument> {
    return this.patch(id, {
      processedAt: new Date(),
      skipReason,
      status: BotActivityStatus.SKIPPED,
    } as Partial<BotActivity>);
  }

  /**
   * Find recent activities for a specific reply bot config
   */
  findRecentByConfig(
    configId: string,
    brandId: string | undefined,
    limit: number = 10,
  ): Promise<BotActivityDocument[]> {
    return this.delegate.findMany({
      where: {
        ...(brandId ? { brandId } : {}),
        isDeleted: false,
        replyBotConfigId: configId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }) as Promise<BotActivityDocument[]>;
  }

  /**
   * Update activity status with optional additional data
   */
  async updateStatus(
    id: string,
    organizationId: string,
    updateData: {
      status?: BotActivityStatus;
      replyTweetId?: string;
      replyTweetUrl?: string;
      replyText?: string;
      dmSent?: boolean;
      dmText?: string;
      errorMessage?: string;
      completedAt?: Date;
    },
  ): Promise<BotActivityDocument | null> {
    const update: Record<string, unknown> = {};

    if (updateData.status !== undefined) {
      update.status = updateData.status;
    }
    if (updateData.replyTweetId !== undefined) {
      update.replyTweetId = updateData.replyTweetId;
    }
    if (updateData.replyTweetUrl !== undefined) {
      update.replyTweetUrl = updateData.replyTweetUrl;
    }
    if (updateData.replyText !== undefined) {
      update.replyTweetText = updateData.replyText;
    }
    if (updateData.dmSent !== undefined) {
      update.dmSent = updateData.dmSent;
    }
    if (updateData.dmText !== undefined) {
      update.dmText = updateData.dmText;
    }
    if (updateData.errorMessage !== undefined) {
      update.errorMessage = updateData.errorMessage;
    }
    if (updateData.completedAt !== undefined) {
      update.processedAt = updateData.completedAt;
    }

    const existing = await this.delegate.findFirst({
      where: { id, isDeleted: false, organizationId },
    });

    if (!existing) {
      return null;
    }

    return this.delegate.update({
      where: { id },
      data: update,
    }) as Promise<BotActivityDocument>;
  }
}
