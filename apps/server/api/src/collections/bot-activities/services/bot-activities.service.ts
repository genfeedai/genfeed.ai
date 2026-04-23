import { BotActivitiesQueryDto } from '@api/collections/bot-activities/dto/bot-activities-query.dto';
import type {
  BotActivity,
  BotActivityDocument,
} from '@api/collections/bot-activities/schemas/bot-activity.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { BotActivityStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

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

  private isActivityObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private normalizeActivity(
    activity: BotActivityDocument,
  ): BotActivityDocument {
    const data = this.isActivityObject(activity.data) ? activity.data : {};

    return {
      ...activity,
      _id:
        typeof activity.mongoId === 'string' && activity.mongoId.length > 0
          ? activity.mongoId
          : activity.id,
      brand:
        activity.brand ??
        (typeof activity.brandId === 'string' || activity.brandId === null
          ? activity.brandId
          : undefined),
      organization: activity.organization ?? activity.organizationId,
      user: activity.user ?? activity.userId,
      ...(data as Partial<BotActivityDocument>),
      data,
    };
  }

  private async patchActivity(
    id: string,
    where: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): Promise<BotActivityDocument | null> {
    const existing = await this.prisma.botActivity.findFirst({ where });

    if (!existing) {
      return null;
    }

    const currentData = this.isActivityObject(existing.data)
      ? existing.data
      : {};
    const updated = await this.prisma.botActivity.update({
      data: {
        data: {
          ...currentData,
          ...patch,
        } as never,
      },
      where: { id: existing.id },
    });

    return this.normalizeActivity(updated as unknown as BotActivityDocument);
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

    const activities = (
      (await this.delegate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      })) as BotActivityDocument[]
    )
      .map((activity) => this.normalizeActivity(activity))
      .filter(
        (activity) =>
          (!query.botType || activity.botType === query.botType) &&
          (!query.status || activity.status === query.status),
      );

    return {
      activities: activities.slice(offset, offset + limit),
      total: activities.length,
    };
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

    const activities = (
      (await this.delegate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      })) as BotActivityDocument[]
    ).map((activity) => this.normalizeActivity(activity));

    const total = activities.length;
    const completed = activities.filter(
      (activity) => activity.status === BotActivityStatus.COMPLETED,
    ).length;
    const failed = activities.filter(
      (activity) => activity.status === BotActivityStatus.FAILED,
    ).length;
    const pending = activities.filter(
      (activity) => activity.status === BotActivityStatus.PENDING,
    ).length;
    const skipped = activities.filter(
      (activity) => activity.status === BotActivityStatus.SKIPPED,
    ).length;
    const totalReplies = activities.filter(
      (activity) => typeof activity.replyTweetId === 'string',
    ).length;
    const totalDms = activities.filter(
      (activity) => activity.dmSent === true,
    ).length;

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
    return this.patchActivity(
      id,
      { id, isDeleted: false },
      { status: BotActivityStatus.PROCESSING },
    ).then((activity) => {
      if (!activity) {
        throw new NotFoundException('Bot activity not found');
      }

      return activity;
    });
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
    const updateData: Record<string, unknown> = {
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

    return this.patchActivity(id, { id, isDeleted: false }, updateData).then(
      (activity) => {
        if (!activity) {
          throw new NotFoundException('Bot activity not found');
        }

        return activity;
      },
    );
  }

  /**
   * Mark activity as failed
   */
  markFailed(
    id: string,
    errorMessage: string,
    errorDetails?: Record<string, unknown>,
  ): Promise<BotActivityDocument> {
    return this.patchActivity(
      id,
      { id, isDeleted: false },
      {
        errorDetails,
        errorMessage,
        processedAt: new Date(),
        status: BotActivityStatus.FAILED,
      },
    ).then((activity) => {
      if (!activity) {
        throw new NotFoundException('Bot activity not found');
      }

      return activity;
    });
  }

  /**
   * Mark activity as skipped
   */
  markSkipped(id: string, skipReason: string): Promise<BotActivityDocument> {
    return this.patchActivity(
      id,
      { id, isDeleted: false },
      {
        processedAt: new Date(),
        skipReason,
        status: BotActivityStatus.SKIPPED,
      },
    ).then((activity) => {
      if (!activity) {
        throw new NotFoundException('Bot activity not found');
      }

      return activity;
    });
  }

  /**
   * Find recent activities for a specific reply bot config
   */
  findRecentByConfig(
    configId: string,
    brandId: string | undefined,
    limit: number = 10,
  ): Promise<BotActivityDocument[]> {
    return this.delegate
      .findMany({
        where: {
          ...(brandId ? { brandId } : {}),
          isDeleted: false,
          replyBotConfigId: configId,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      .then((activities) =>
        (activities as BotActivityDocument[]).map((activity) =>
          this.normalizeActivity(activity),
        ),
      );
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

    return this.patchActivity(
      id,
      { id, isDeleted: false, organizationId },
      update,
    );
  }
}
