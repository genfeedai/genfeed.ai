import { BotActivitiesQueryDto } from '@api/collections/bot-activities/dto/bot-activities-query.dto';
import type {
  BotActivity,
  BotActivityDocument,
} from '@api/collections/bot-activities/schemas/bot-activity.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { BotActivityStatus } from '@genfeedai/contracts';
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';
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

export type BotActivityCreateInput = {
  brandId?: string | null;
  data?: Record<string, unknown>;
  monitoredAccountId?: string | null;
  organizationId: string;
  replyBotConfigId?: string | null;
  userId: string;
  [key: string]: unknown;
};

const BOT_ACTIVITY_COLUMNS = new Set([
  'brandId',
  'data',
  'isDeleted',
  'monitoredAccountId',
  'organizationId',
  'replyBotConfigId',
  'userId',
]);

const BOT_ACTIVITY_IDENTITY_KEYS = new Set([
  'brand',
  'brandId',
  'monitoredAccount',
  'monitoredAccountId',
  'organization',
  'organizationId',
  'replyBotConfig',
  'replyBotConfigId',
  'user',
  'userId',
]);

@Injectable()
export class BotActivitiesService extends BaseService<
  BotActivityDocument,
  BotActivityCreateInput,
  Partial<BotActivity>,
  Prisma.BotActivityWhereInput
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

  override create(input: BotActivityCreateInput): Promise<BotActivityDocument> {
    const data = this.isActivityObject(input.data) ? { ...input.data } : {};

    for (const key of BOT_ACTIVITY_IDENTITY_KEYS) {
      delete data[key];
    }

    for (const [key, value] of Object.entries(input)) {
      if (
        !BOT_ACTIVITY_COLUMNS.has(key) &&
        !BOT_ACTIVITY_IDENTITY_KEYS.has(key) &&
        value !== undefined
      ) {
        data[key] = value;
      }
    }

    return super.create({
      brandId: input.brandId,
      data,
      isDeleted: input.isDeleted,
      monitoredAccountId: input.monitoredAccountId,
      organizationId: input.organizationId,
      replyBotConfigId: input.replyBotConfigId,
      userId: input.userId,
    });
  }

  private normalizeActivity(
    activity: BotActivityDocument,
  ): BotActivityDocument {
    const data = this.isActivityObject(activity.data)
      ? { ...activity.data }
      : {};

    for (const key of BOT_ACTIVITY_IDENTITY_KEYS) {
      delete data[key];
    }

    return {
      ...(data as Partial<BotActivityDocument>),
      ...activity,
      data,
    };
  }

  private async patchActivity(
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
        data: toPrismaJson({
          ...currentData,
          ...patch,
        }),
      },
      where: scopedWhere(existing.organizationId, { id: existing.id }),
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
    const where: Record<string, unknown> = scopedWhere(organizationId, {
      ...(brandId ? { brandId } : {}),
    });

    if (query.replyBotConfigId) {
      where.replyBotConfigId = query.replyBotConfigId;
    }

    if (query.monitoredAccountId) {
      where.monitoredAccountId = query.monitoredAccountId;
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
    const where: Record<string, unknown> = scopedWhere(organizationId, {
      ...(brandId ? { brandId } : {}),
    });

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
      { id, isDeleted: false },
      { status: BotActivityStatus.PROCESSING },
    ).then((activity) => {
      if (!activity) {
        throw new NotFoundException('Bot activity');
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

    return this.patchActivity({ id, isDeleted: false }, updateData).then(
      (activity) => {
        if (!activity) {
          throw new NotFoundException('Bot activity');
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
      { id, isDeleted: false },
      {
        errorDetails,
        errorMessage,
        processedAt: new Date(),
        status: BotActivityStatus.FAILED,
      },
    ).then((activity) => {
      if (!activity) {
        throw new NotFoundException('Bot activity');
      }

      return activity;
    });
  }

  /**
   * Mark activity as skipped
   */
  markSkipped(id: string, skipReason: string): Promise<BotActivityDocument> {
    return this.patchActivity(
      { id, isDeleted: false },
      {
        processedAt: new Date(),
        skipReason,
        status: BotActivityStatus.SKIPPED,
      },
    ).then((activity) => {
      if (!activity) {
        throw new NotFoundException('Bot activity');
      }

      return activity;
    });
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

    return this.patchActivity(scopedWhere(organizationId, { id }), update);
  }
}
