import { BotActivitiesQueryDto } from '@api/collections/bot-activities/dto/bot-activities-query.dto';
import type {
  BotActivity,
  BotActivityDocument,
} from '@api/collections/bot-activities/schemas/bot-activity.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { buildPaginatedResult } from '@api/helpers/utils/paginated-result/paginated-result.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { BotActivityStatus } from '@genfeedai/contracts';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const DEFAULT_BOT_ACTIVITIES_PAGE_SIZE = 20;

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
   * The needs-review hold on a comment (#4866): the skipped activity that
   * queued it for a person. While one exists the bot must not decide the
   * comment again — a redelivered webhook or the next poll would otherwise
   * spend another decision and, on a confident answer, auto-reply to a
   * comment a human was asked to handle. The hold ends when the human flow
   * marks the comment processed; callers check that first.
   */
  async findIntentReviewHold(
    organizationId: string,
    triggerTweetId: string,
  ): Promise<BotActivityDocument | null> {
    const existing = await this.prisma.botActivity.findFirst({
      orderBy: { createdAt: 'desc' },
      where: scopedWhere(organizationId, {
        AND: [
          { data: { equals: triggerTweetId, path: ['triggerTweetId'] } },
          { data: { equals: true, path: ['isIntentNeedsReview'] } },
        ],
      }),
    });

    return existing
      ? this.normalizeActivity(existing as unknown as BotActivityDocument)
      : null;
  }

  /**
   * Find activities with filters, paginated in SQL. `status` and `botType`
   * live in the `data` JSON column, so they are JSON-path filters in the
   * `where` rather than an in-memory pass over every row.
   */
  async findWithFilters(
    organizationId: string,
    brandId: string | undefined,
    query: BotActivitiesQueryDto,
  ): Promise<AggregatePaginateResult<BotActivityDocument>> {
    const where: Record<string, unknown> = scopedWhere(organizationId, {
      ...(brandId ? { brandId } : {}),
    });

    if (query.replyBotConfigId) {
      where.replyBotConfigId = query.replyBotConfigId;
    }

    if (query.monitoredAccountId) {
      where.monitoredAccountId = query.monitoredAccountId;
    }

    const createdAt = this.buildCreatedAtRange(
      query.fromDate ? new Date(query.fromDate) : undefined,
      query.toDate ? new Date(query.toDate) : undefined,
    );
    if (createdAt) {
      where.createdAt = createdAt;
    }

    const jsonFilters: Prisma.BotActivityWhereInput[] = [];
    if (query.botType) {
      jsonFilters.push({ data: { equals: query.botType, path: ['botType'] } });
    }
    if (query.status) {
      jsonFilters.push({ data: { equals: query.status, path: ['status'] } });
    }
    if (jsonFilters.length > 0) {
      where.AND = jsonFilters;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_BOT_ACTIVITIES_PAGE_SIZE;

    const [rows, totalDocs] = await Promise.all([
      this.delegate.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        where,
      }) as Promise<BotActivityDocument[]>,
      this.delegate.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((activity) => this.normalizeActivity(activity)),
      totalDocs,
      page,
      limit,
    );
  }

  private buildCreatedAtRange(
    fromDate?: Date,
    toDate?: Date,
  ): Prisma.DateTimeFilter | undefined {
    if (!fromDate && !toDate) {
      return undefined;
    }

    return {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  /**
   * Get aggregated statistics for an organization. Every figure is a
   * database `count` over the same scoped window, so no row is loaded.
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

    const createdAt = this.buildCreatedAtRange(fromDate, toDate);
    if (createdAt) {
      where.createdAt = createdAt;
    }

    const countWhere = (extra: Prisma.BotActivityWhereInput): Promise<number> =>
      this.delegate.count({ where: { ...where, ...extra } });
    const countStatus = (status: BotActivityStatus): Promise<number> =>
      countWhere({ data: { equals: status, path: ['status'] } });

    const [total, completed, failed, pending, skipped, totalReplies, totalDms] =
      await Promise.all([
        this.delegate.count({ where }),
        countStatus(BotActivityStatus.COMPLETED),
        countStatus(BotActivityStatus.FAILED),
        countStatus(BotActivityStatus.PENDING),
        countStatus(BotActivityStatus.SKIPPED),
        countWhere({ data: { not: Prisma.AnyNull, path: ['replyTweetId'] } }),
        countWhere({ data: { equals: true, path: ['dmSent'] } }),
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
