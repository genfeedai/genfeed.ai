import {
  CreativePattern,
  type CreativePatternDocument,
} from '@api/collections/creative-patterns/schemas/creative-pattern.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import type { PatternType } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

@Injectable()
export class CreativePatternsService {
  constructor(
    @InjectModel(CreativePattern.name, DB_CONNECTIONS.CLOUD)
    private readonly creativePatternsModel: Model<CreativePatternDocument>,
  ) {}

  async upsertPattern(
    data: Partial<CreativePattern>,
  ): Promise<CreativePattern> {
    const filter: Record<string, unknown> = {
      brand: data.brand || null,
      industry: data.industry || null,
      organization: data.organization || null,
      patternType: data.patternType,
      platform: data.platform || null,
      scope: data.scope,
    };

    return this.creativePatternsModel.findOneAndUpdate(
      filter,
      { $set: data },
      { new: true, upsert: true },
    );
  }

  async findTopForBrand(
    orgId: string,
    _brandId: string,
    options?: { limit?: number; patternTypes?: PatternType[] },
  ): Promise<CreativePattern[]> {
    const limit = options?.limit ?? 10;
    const now = new Date();

    const query: Record<string, unknown> = {
      $or: [
        // Public patterns (shared insights)
        {
          isDeleted: false,
          scope: 'public',
          validUntil: { $gte: now },
        },
        // Private patterns scoped to this org
        {
          isDeleted: false,
          organization: new Types.ObjectId(orgId),
          scope: 'private',
          validUntil: { $gte: now },
        },
      ],
    };

    if (options?.patternTypes?.length) {
      query.patternType = { $in: options.patternTypes };
    }

    return this.creativePatternsModel
      .find(query)
      .sort({ avgPerformanceScore: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async findAll(filters: {
    platform?: string;
    patternType?: PatternType;
    scope?: string;
  }): Promise<CreativePattern[]> {
    const query: Record<string, unknown> = {
      isDeleted: false,
      validUntil: { $gte: new Date() },
    };

    if (filters.platform) {
      query.platform = filters.platform;
    }

    if (filters.patternType) {
      query.patternType = filters.patternType;
    }

    if (filters.scope) {
      query.scope = filters.scope;
    }

    return this.creativePatternsModel
      .find(query)
      .sort({ avgPerformanceScore: -1 })
      .lean()
      .exec();
  }
}
