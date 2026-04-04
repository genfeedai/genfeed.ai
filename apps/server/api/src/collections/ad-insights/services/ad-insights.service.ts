import {
  AdInsights,
  type AdInsightsDocument,
  type InsightType,
} from '@api/collections/ad-insights/schemas/ad-insights.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

@Injectable()
export class AdInsightsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    @InjectModel(AdInsights.name, DB_CONNECTIONS.CLOUD)
    private readonly adInsightsModel: Model<AdInsightsDocument>,
    private readonly logger: LoggerService,
  ) {}

  async upsertInsight(data: Partial<AdInsights>): Promise<AdInsights> {
    return this.adInsightsModel.findOneAndUpdate(
      {
        adPlatform: data.adPlatform || null,
        industry: data.industry || null,
        insightType: data.insightType,
      },
      { $set: data },
      { new: true, upsert: true },
    );
  }

  async getInsight(
    insightType: InsightType,
    params?: { adPlatform?: string; industry?: string },
  ): Promise<AdInsights | null> {
    const query: Record<string, unknown> = {
      insightType,
      isDeleted: false,
      validUntil: { $gte: new Date() },
    };
    if (params?.adPlatform) query.adPlatform = params.adPlatform;
    if (params?.industry) query.industry = params.industry;

    return this.adInsightsModel
      .findOne(query)
      .sort({ computedAt: -1 })
      .lean()
      .exec();
  }

  async getInsightsByType(insightType: InsightType): Promise<AdInsights[]> {
    return this.adInsightsModel
      .find({
        insightType,
        isDeleted: false,
        validUntil: { $gte: new Date() },
      })
      .sort({ computedAt: -1 })
      .lean()
      .exec();
  }

  async removeExpired(): Promise<number> {
    const result = await this.adInsightsModel.deleteMany({
      validUntil: { $lt: new Date() },
    });
    return result.deletedCount;
  }
}
