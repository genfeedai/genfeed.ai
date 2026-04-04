import { CreateCampaignTargetDto } from '@api/collections/campaign-targets/dto/create-campaign-target.dto';
import { UpdateCampaignTargetDto } from '@api/collections/campaign-targets/dto/update-campaign-target.dto';
import {
  CampaignTarget,
  type CampaignTargetDocument,
} from '@api/collections/campaign-targets/schemas/campaign-target.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import type { PopulateOption } from '@genfeedai/interfaces';
import { CampaignSkipReason, CampaignTargetStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class CampaignTargetsService extends BaseService<
  CampaignTargetDocument,
  CreateCampaignTargetDto,
  UpdateCampaignTargetDto
> {
  constructor(
    @InjectModel(CampaignTarget.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<CampaignTargetDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  create(
    createDto: CreateCampaignTargetDto,
    populate: (string | PopulateOption)[] = [{ path: 'campaign' }],
  ): Promise<CampaignTargetDocument> {
    return super.create(createDto, populate);
  }

  /**
   * Create multiple targets at once
   */
  async createMany(
    targets: CreateCampaignTargetDto[],
  ): Promise<CampaignTargetDocument[]> {
    const created = await this.model.insertMany(targets);
    return created as CampaignTargetDocument[];
  }

  /**
   * Find a target by ID
   */
  findById(id: string): Promise<CampaignTargetDocument | null> {
    return this.model.findById(id).exec();
  }

  /**
   * Find targets by campaign
   */
  findByCampaign(campaignId: string): Promise<CampaignTargetDocument[]> {
    return this.model
      .find({
        campaign: new Types.ObjectId(campaignId),
        isDeleted: false,
      })
      .exec();
  }

  /**
   * Find targets by campaign and status
   */
  findByCampaignAndStatus(
    campaignId: string,
    status: CampaignTargetStatus,
  ): Promise<CampaignTargetDocument[]> {
    return this.model
      .find({
        campaign: new Types.ObjectId(campaignId),
        isDeleted: false,
        status,
      })
      .exec();
  }

  /**
   * Get the next pending target for processing
   */
  getNextPending(campaignId: string): Promise<CampaignTargetDocument | null> {
    return this.model
      .findOne({
        campaign: new Types.ObjectId(campaignId),
        isDeleted: false,
        status: CampaignTargetStatus.PENDING,
      })
      .sort({ createdAt: 1, scheduledAt: 1 })
      .exec();
  }

  /**
   * Get pending targets that are ready to be processed
   */
  getPendingTargets(
    campaignId: string,
    limit: number = 10,
  ): Promise<CampaignTargetDocument[]> {
    const now = new Date();

    return this.model
      .find({
        $or: [
          { scheduledAt: { $exists: false } },
          { scheduledAt: { $lte: now } },
        ],
        campaign: new Types.ObjectId(campaignId),
        isDeleted: false,
        status: CampaignTargetStatus.PENDING,
      })
      .sort({ createdAt: 1, scheduledAt: 1 })
      .limit(limit)
      .exec();
  }

  /**
   * Mark a target as processing
   */
  markAsProcessing(id: string): Promise<CampaignTargetDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        { $set: { status: CampaignTargetStatus.PROCESSING } },
        { returnDocument: 'after' },
      )
      .exec();
  }

  /**
   * Mark a target as replied
   */
  markAsReplied(
    id: string,
    replyData: {
      replyText: string;
      replyExternalId: string;
      replyUrl: string;
    },
  ): Promise<CampaignTargetDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        {
          $set: {
            processedAt: new Date(),
            replyExternalId: replyData.replyExternalId,
            replyText: replyData.replyText,
            replyUrl: replyData.replyUrl,
            status: CampaignTargetStatus.REPLIED,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
  }

  /**
   * Mark a target as failed
   */
  markAsFailed(
    id: string,
    errorMessage: string,
    retryCount: number = 0,
  ): Promise<CampaignTargetDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        {
          $set: {
            errorMessage,
            processedAt: new Date(),
            retryCount,
            status: CampaignTargetStatus.FAILED,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
  }

  /**
   * Mark a target as skipped
   */
  markAsSkipped(
    id: string,
    skipReason: CampaignSkipReason,
  ): Promise<CampaignTargetDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        {
          $set: {
            processedAt: new Date(),
            skipReason,
            status: CampaignTargetStatus.SKIPPED,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
  }

  /**
   * Schedule a target for future processing
   */
  scheduleTarget(
    id: string,
    scheduledAt: Date,
  ): Promise<CampaignTargetDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        {
          $set: {
            scheduledAt,
            status: CampaignTargetStatus.SCHEDULED,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
  }

  /**
   * Update a single target by ID
   */
  updateOne(
    id: string,
    update: Record<string, unknown>,
  ): Promise<CampaignTargetDocument | null> {
    return this.model
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
      .exec();
  }

  /**
   * Check if a target already exists (by external ID)
   */
  async targetExists(campaignId: string, externalId: string): Promise<boolean> {
    const target = await this.model
      .findOne({
        campaign: new Types.ObjectId(campaignId),
        externalId,
        isDeleted: false,
      })
      .exec();

    return !!target;
  }

  /**
   * Get target statistics for a campaign
   */
  async getTargetStats(campaignId: string): Promise<{
    total: number;
    pending: number;
    scheduled: number;
    processing: number;
    replied: number;
    skipped: number;
    failed: number;
  }> {
    const stats = await this.model.aggregate([
      {
        $match: {
          campaign: new Types.ObjectId(campaignId),
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const statusCounts = stats.reduce(
      (acc, item) => {
        acc[item._id] = item.count;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      failed: statusCounts[CampaignTargetStatus.FAILED] || 0,
      pending: statusCounts[CampaignTargetStatus.PENDING] || 0,
      processing: statusCounts[CampaignTargetStatus.PROCESSING] || 0,
      replied: statusCounts[CampaignTargetStatus.REPLIED] || 0,
      scheduled: statusCounts[CampaignTargetStatus.SCHEDULED] || 0,
      skipped: statusCounts[CampaignTargetStatus.SKIPPED] || 0,
      // @ts-expect-error TS2322
      total:
        // @ts-expect-error TS18046
        Object.values(statusCounts).reduce((sum, count) => sum + count, 0) || 0,
    };
  }

  /**
   * Reset failed targets for retry
   */
  async resetFailedTargets(campaignId: string): Promise<number> {
    const result = await this.model.updateMany(
      {
        campaign: new Types.ObjectId(campaignId),
        isDeleted: false,
        status: CampaignTargetStatus.FAILED,
      },
      {
        $inc: { retryCount: 1 },
        $set: { status: CampaignTargetStatus.PENDING },
      },
    );

    return result.modifiedCount;
  }
}
