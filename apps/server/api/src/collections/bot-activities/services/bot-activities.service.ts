import { BotActivitiesQueryDto } from '@api/collections/bot-activities/dto/bot-activities-query.dto';
import {
  BotActivity,
  type BotActivityDocument,
} from '@api/collections/bot-activities/schemas/bot-activity.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { BotActivityStatus } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

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
    @InjectModel(BotActivity.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<BotActivityDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  create(
    createDto: Partial<BotActivity>,
    populate: (string | PopulateOption)[] = [
      { path: 'organization' },
      { path: 'replyBotConfig' },
      { path: 'monitoredAccount' },
    ],
  ): Promise<BotActivityDocument> {
    return super.create(createDto, populate);
  }

  /**
   * Find activities with filters and pagination
   */
  async findWithFilters(
    organizationId: string,
    brandId: string | undefined,
    query: BotActivitiesQueryDto,
  ): Promise<{ activities: BotActivityDocument[]; total: number }> {
    const filter: Record<string, unknown> = {
      ...(brandId ? { brand: new Types.ObjectId(brandId) } : {}),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (query.replyBotConfig) {
      filter.replyBotConfig = new Types.ObjectId(query.replyBotConfig);
    }

    if (query.monitoredAccount) {
      filter.monitoredAccount = new Types.ObjectId(query.monitoredAccount);
    }

    if (query.botType) {
      filter.botType = query.botType;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.fromDate || query.toDate) {
      filter.createdAt = {};
      if (query.fromDate) {
        // @ts-expect-error TS18046
        filter.createdAt.$gte = new Date(query.fromDate);
      }
      if (query.toDate) {
        // @ts-expect-error TS18046
        filter.createdAt.$lte = new Date(query.toDate);
      }
    }

    const limit = query.limit || 20;
    const offset = query.offset || 0;

    const [activities, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .populate([
          { path: 'replyBotConfig', select: 'label type actionType' },
          {
            path: 'monitoredAccount',
            select: 'twitterUsername twitterDisplayName',
          },
        ])
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return { activities: activities as BotActivityDocument[], total };
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
    const matchStage: Record<string, unknown> = {
      ...(brandId ? { brand: new Types.ObjectId(brandId) } : {}),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (replyBotConfigId) {
      matchStage.replyBotConfig = new Types.ObjectId(replyBotConfigId);
    }

    if (fromDate || toDate) {
      matchStage.createdAt = {};
      if (fromDate) {
        // @ts-expect-error TS18046
        matchStage.createdAt.$gte = fromDate;
      }
      if (toDate) {
        // @ts-expect-error TS18046
        matchStage.createdAt.$lte = toDate;
      }
    }

    const result = await this.model.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          completed: {
            $sum: {
              $cond: [{ $eq: ['$status', BotActivityStatus.COMPLETED] }, 1, 0],
            },
          },
          failed: {
            $sum: {
              $cond: [{ $eq: ['$status', BotActivityStatus.FAILED] }, 1, 0],
            },
          },
          pending: {
            $sum: {
              $cond: [{ $eq: ['$status', BotActivityStatus.PENDING] }, 1, 0],
            },
          },
          skipped: {
            $sum: {
              $cond: [{ $eq: ['$status', BotActivityStatus.SKIPPED] }, 1, 0],
            },
          },
          total: { $sum: 1 },
          totalDms: {
            $sum: { $cond: ['$dmSent', 1, 0] },
          },
          totalReplies: {
            $sum: { $cond: [{ $ne: ['$replyTweetId', null] }, 1, 0] },
          },
        },
      },
    ]);

    if (result.length === 0) {
      return {
        completed: 0,
        failed: 0,
        pending: 0,
        skipped: 0,
        total: 0,
        totalDms: 0,
        totalReplies: 0,
      };
    }

    return result[0];
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
    return this.model
      .find({
        ...(brandId ? { brand: new Types.ObjectId(brandId) } : {}),
        isDeleted: false,
        replyBotConfig: new Types.ObjectId(configId),
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec() as Promise<BotActivityDocument[]>;
  }

  /**
   * Update activity status with optional additional data
   */
  updateStatus(
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
    const update: Partial<BotActivity> = {};

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

    return this.model.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      { $set: update },
      { returnDocument: 'after' },
    );
  }
}
