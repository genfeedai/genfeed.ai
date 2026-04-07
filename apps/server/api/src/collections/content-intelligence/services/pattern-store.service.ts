import {
  ContentPattern,
  type ContentPatternDocument,
} from '@api/collections/content-intelligence/schemas/content-pattern.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import {
  ContentIntelligencePlatform,
  ContentPatternType,
  TemplateCategory,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type PipelineStage, Types } from 'mongoose';

export interface CreatePatternDto {
  organization: Types.ObjectId;
  sourceCreator?: Types.ObjectId;
  platform: ContentIntelligencePlatform;
  patternType: ContentPatternType;
  templateCategory?: TemplateCategory;
  rawExample: string;
  extractedFormula: string;
  description?: string;
  placeholders: string[];
  sourceMetrics: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
    engagementRate: number;
    viralScore: number;
  };
  embedding?: number[];
  tags: string[];
  sourcePostId?: string;
  sourcePostUrl?: string;
  sourcePostDate?: Date;
}

@Injectable()
export class PatternStoreService extends BaseService<
  ContentPatternDocument,
  CreatePatternDto,
  Partial<CreatePatternDto>
> {
  constructor(
    @InjectModel(ContentPattern.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<ContentPatternDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  storePattern(dto: CreatePatternDto): Promise<ContentPatternDocument> {
    return this.create({
      ...dto,
      relevanceWeight: 1.0,
      usageCount: 0,
    } as CreatePatternDto);
  }

  async storeBulkPatterns(
    patterns: CreatePatternDto[],
  ): Promise<ContentPatternDocument[]> {
    const results: ContentPatternDocument[] = [];
    for (const pattern of patterns) {
      const result = await this.storePattern(pattern);
      results.push(result);
    }
    return results;
  }

  async findByOrganization(
    organizationId: Types.ObjectId,
    filters?: {
      platform?: ContentIntelligencePlatform;
      patternType?: ContentPatternType;
      templateCategory?: TemplateCategory;
      sourceCreator?: Types.ObjectId;
      tags?: string[];
      minRelevanceWeight?: number;
      minEngagementRate?: number;
    },
  ): Promise<ContentPatternDocument[]> {
    const match: Record<string, unknown> = {
      isDeleted: false,
      organization: organizationId,
    };

    if (filters?.platform) {
      match.platform = filters.platform;
    }
    if (filters?.patternType) {
      match.patternType = filters.patternType;
    }
    if (filters?.templateCategory) {
      match.templateCategory = filters.templateCategory;
    }
    if (filters?.sourceCreator) {
      match.sourceCreator = filters.sourceCreator;
    }
    if (filters?.tags && filters.tags.length > 0) {
      match.tags = { $in: filters.tags };
    }
    if (filters?.minRelevanceWeight !== undefined) {
      match.relevanceWeight = { $gte: filters.minRelevanceWeight };
    }
    if (filters?.minEngagementRate !== undefined) {
      match['sourceMetrics.engagementRate'] = {
        $gte: filters.minEngagementRate,
      };
    }

    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sort: { createdAt: -1, 'sourceMetrics.engagementRate': -1 } },
    ];

    const result = await this.findAll(pipeline, { pagination: false });
    return result.docs;
  }

  async findHooks(
    organizationId: Types.ObjectId,
    platform?: ContentIntelligencePlatform,
    limit = 50,
  ): Promise<ContentPatternDocument[]> {
    const match: Record<string, unknown> = {
      isDeleted: false,
      organization: organizationId,
      patternType: ContentPatternType.HOOK,
    };

    if (platform) {
      match.platform = platform;
    }

    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sort: { 'sourceMetrics.engagementRate': -1 } },
      { $limit: limit },
    ];

    const result = await this.findAll(pipeline, { pagination: false });
    return result.docs;
  }

  findByCreator(creatorId: Types.ObjectId): Promise<ContentPatternDocument[]> {
    return this.findAllByOrganization('', {
      sourceCreator: creatorId,
    });
  }

  async incrementUsage(id: Types.ObjectId | string): Promise<void> {
    await this.patchAll(
      { _id: new Types.ObjectId(id.toString()) },
      { $inc: { usageCount: 1 } },
    );
  }

  updateRelevanceWeight(
    id: Types.ObjectId | string,
    weight: number,
  ): Promise<ContentPatternDocument> {
    return this.patch(id, {
      relevanceWeight: Math.max(0, Math.min(1, weight)),
    });
  }

  async deleteByCreator(creatorId: Types.ObjectId): Promise<{ count: number }> {
    const result = await this.patchAll(
      { isDeleted: false, sourceCreator: creatorId },
      { $set: { isDeleted: true } },
    );
    return { count: result.modifiedCount };
  }
}
