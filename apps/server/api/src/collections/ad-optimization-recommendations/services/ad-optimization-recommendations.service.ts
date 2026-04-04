import {
  AdOptimizationRecommendation,
  type AdOptimizationRecommendationDocument,
  type RecommendationStatus,
  type RecommendationType,
} from '@api/collections/ad-optimization-recommendations/schemas/ad-optimization-recommendation.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';

@Injectable()
export class AdOptimizationRecommendationsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    @InjectModel(AdOptimizationRecommendation.name, DB_CONNECTIONS.CLOUD)
    private readonly recommendationModel: Model<AdOptimizationRecommendationDocument>,
    private readonly logger: LoggerService,
  ) {}

  async createBatch(
    recommendations: Partial<AdOptimizationRecommendation>[],
  ): Promise<number> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const result = await this.recommendationModel.insertMany(
        recommendations,
        { ordered: false },
      );
      this.logger.log(`${caller} created ${result.length} recommendations`);
      return result.length;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async findByOrganization(
    organizationId: string,
    params?: {
      status?: RecommendationStatus;
      recommendationType?: RecommendationType;
      limit?: number;
      offset?: number;
    },
  ): Promise<AdOptimizationRecommendationDocument[]> {
    const query: Record<string, unknown> = {
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (params?.status) query.status = params.status;
    if (params?.recommendationType)
      query.recommendationType = params.recommendationType;

    return this.recommendationModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(params?.offset || 0)
      .limit(params?.limit || 50)
      .lean()
      .exec();
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<AdOptimizationRecommendationDocument | null> {
    return this.recommendationModel
      .findOne({
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .lean()
      .exec();
  }

  async approve(
    id: string,
    organizationId: string,
  ): Promise<AdOptimizationRecommendationDocument | null> {
    return this.updateStatus(id, organizationId, 'approved', 'pending');
  }

  async reject(
    id: string,
    organizationId: string,
  ): Promise<AdOptimizationRecommendationDocument | null> {
    return this.updateStatus(id, organizationId, 'rejected', 'pending');
  }

  async markExecuted(
    id: string,
    organizationId: string,
  ): Promise<AdOptimizationRecommendationDocument | null> {
    return this.updateStatus(id, organizationId, 'executed', 'approved');
  }

  async expireStale(): Promise<number> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const result = await this.recommendationModel.updateMany(
        {
          expiresAt: { $lte: new Date() },
          isDeleted: false,
          status: 'pending',
        },
        { $set: { status: 'expired' } },
      );

      if (result.modifiedCount > 0) {
        this.logger.log(
          `${caller} expired ${result.modifiedCount} stale recommendations`,
        );
      }

      return result.modifiedCount;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async findExistingPending(
    organizationId: string,
    entityId: string,
    recommendationType: RecommendationType,
  ): Promise<AdOptimizationRecommendationDocument | null> {
    return this.recommendationModel
      .findOne({
        entityId,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        recommendationType,
        status: 'pending',
      })
      .lean()
      .exec();
  }

  private async updateStatus(
    id: string,
    organizationId: string,
    status: RecommendationStatus,
    expectedCurrentStatus: RecommendationStatus,
  ): Promise<AdOptimizationRecommendationDocument | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const doc = await this.recommendationModel
        .findOneAndUpdate(
          {
            _id: new Types.ObjectId(id),
            isDeleted: false,
            organization: new Types.ObjectId(organizationId),
            status: expectedCurrentStatus,
          },
          { $set: { status } },
          { new: true },
        )
        .lean()
        .exec();

      if (!doc) {
        const existing = await this.recommendationModel
          .findOne({
            _id: new Types.ObjectId(id),
            isDeleted: false,
            organization: new Types.ObjectId(organizationId),
          })
          .lean()
          .exec();

        if (existing) {
          throw new ConflictException(
            `Cannot transition recommendation ${id} to '${status}': expected status '${expectedCurrentStatus}' but found '${existing.status}'`,
          );
        }

        return null;
      }

      this.logger.log(`${caller} updated recommendation ${id} to ${status}`);
      return doc;
    } catch (error: unknown) {
      if (error instanceof ConflictException) throw error;
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }
}
