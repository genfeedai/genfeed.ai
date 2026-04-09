import {
  AdPerformance,
  type AdPerformanceDocument,
} from '@api/collections/ad-performance/schemas/ad-performance.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

@Injectable()
export class AdPerformanceService {
  private readonly constructorName = this.constructor.name;

  constructor(
    @InjectModel(AdPerformance.name, DB_CONNECTIONS.CLOUD)
    private readonly adPerformanceModel: Model<AdPerformanceDocument>,
    private readonly logger: LoggerService,
  ) {}

  async upsert(data: Partial<AdPerformance>): Promise<AdPerformance> {
    const filter = this.buildUpsertKey(data);
    const result = await this.adPerformanceModel.findOneAndUpdate(
      filter,
      { $set: data },
      { new: true, upsert: true },
    );
    return result;
  }

  async upsertBatch(records: Partial<AdPerformance>[]): Promise<number> {
    const operations = records.map((data) => ({
      updateOne: {
        filter: this.buildUpsertKey(data),
        update: { $set: data },
        upsert: true,
      },
    }));

    const result = await this.adPerformanceModel.bulkWrite(operations);
    return result.upsertedCount + result.modifiedCount;
  }

  async findByOrganization(
    organizationId: string,
    params: {
      adPlatform?: string;
      startDate?: Date;
      endDate?: Date;
      granularity?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<AdPerformance[]> {
    const query: Record<string, unknown> = {
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (params.adPlatform) query.adPlatform = params.adPlatform;
    if (params.granularity) query.granularity = params.granularity;
    if (params.startDate || params.endDate) {
      query.date = {};
      if (params.startDate)
        (query.date as Record<string, unknown>).$gte = params.startDate;
      if (params.endDate)
        (query.date as Record<string, unknown>).$lte = params.endDate;
    }

    return this.adPerformanceModel
      .find(query)
      .sort({ date: -1 })
      .skip(params.offset || 0)
      .limit(params.limit || 50)
      .lean()
      .exec();
  }

  async findTopPerformers(params: {
    adPlatform?: string;
    industry?: string;
    scope?: string;
    metric?: string;
    limit?: number;
  }): Promise<AdPerformance[]> {
    const query: Record<string, unknown> = {
      isDeleted: false,
      scope: params.scope || 'public',
    };

    if (params.adPlatform) query.adPlatform = params.adPlatform;
    if (params.industry) query.industry = params.industry;

    const sortField = params.metric || 'performanceScore';
    return this.adPerformanceModel
      .find(query)
      .sort({ [sortField]: -1 })
      .limit(params.limit || 10)
      .lean()
      .exec();
  }

  async findById(id: string): Promise<AdPerformance | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return this.adPerformanceModel
      .findOne({
        _id: new Types.ObjectId(id),
        isDeleted: false,
      })
      .lean()
      .exec();
  }

  async findLatestSyncDateForCredential(
    credentialId: string,
  ): Promise<Date | null> {
    if (!Types.ObjectId.isValid(credentialId)) {
      return null;
    }

    const latestRecord = await this.adPerformanceModel
      .findOne({
        credential: new Types.ObjectId(credentialId),
        isDeleted: false,
      })
      .sort({ date: -1 })
      .select({ date: 1 })
      .lean()
      .exec();

    return latestRecord?.date ?? null;
  }

  async removeOrgFromAggregation(organizationId: string): Promise<number> {
    const result = await this.adPerformanceModel.updateMany(
      { organization: new Types.ObjectId(organizationId) },
      { $set: { scope: 'organization' } },
    );
    return result.modifiedCount;
  }

  private buildUpsertKey(
    data: Partial<AdPerformance>,
  ): Record<string, unknown> {
    const key: Record<string, unknown> = {
      adPlatform: data.adPlatform,
      date: data.date,
      externalAccountId: data.externalAccountId,
      granularity: data.granularity,
    };

    switch (data.granularity) {
      case 'campaign':
        key.externalCampaignId = data.externalCampaignId;
        break;
      case 'adset':
        key.externalAdSetId = data.externalAdSetId || data.externalAdGroupId;
        break;
      case 'ad':
        key.externalAdId = data.externalAdId;
        break;
    }

    return key;
  }
}
