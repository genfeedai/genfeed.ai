import type { ContentPatternDocument } from '@api/collections/content-intelligence/schemas/content-pattern.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  ContentIntelligencePlatform,
  ContentPatternType,
  TemplateCategory,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface CreatePatternDto {
  organizationId: string;
  sourceCreatorId?: string;
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
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'contentPattern', logger);
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
    organizationId: string,
    filters?: {
      platform?: ContentIntelligencePlatform;
      patternType?: ContentPatternType;
      templateCategory?: TemplateCategory;
      sourceCreator?: string;
      tags?: string[];
      minRelevanceWeight?: number;
      minEngagementRate?: number;
    },
  ): Promise<ContentPatternDocument[]> {
    const where: Record<string, unknown> = {
      isDeleted: false,
      organizationId,
    };

    if (filters?.platform) {
      where.platform = filters.platform;
    }
    if (filters?.patternType) {
      where.patternType = filters.patternType;
    }
    if (filters?.templateCategory) {
      where.templateCategory = filters.templateCategory;
    }
    if (filters?.sourceCreator) {
      where.sourceCreatorId = filters.sourceCreator;
    }
    if (filters?.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }
    if (filters?.minRelevanceWeight !== undefined) {
      where.relevanceWeight = { gte: filters.minRelevanceWeight };
    }
    if (filters?.minEngagementRate !== undefined) {
      where.sourceMetrics = {
        path: ['engagementRate'],
        gte: filters.minEngagementRate,
      };
    }

    return this.delegate.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
    }) as Promise<ContentPatternDocument[]>;
  }

  async findHooks(
    organizationId: string,
    platform?: ContentIntelligencePlatform,
    limit = 50,
  ): Promise<ContentPatternDocument[]> {
    const where: Record<string, unknown> = {
      isDeleted: false,
      organizationId,
      patternType: ContentPatternType.HOOK,
    };

    if (platform) {
      where.platform = platform;
    }

    return this.delegate.findMany({
      where,
      take: limit,
    }) as Promise<ContentPatternDocument[]>;
  }

  findByCreator(creatorId: string): Promise<ContentPatternDocument[]> {
    return this.delegate.findMany({
      where: { isDeleted: false, sourceCreatorId: creatorId },
    }) as Promise<ContentPatternDocument[]>;
  }

  async incrementUsage(id: string): Promise<void> {
    await this.delegate.update({
      where: { id },
      data: { usageCount: { increment: 1 } },
    });
  }

  updateRelevanceWeight(
    id: string,
    weight: number,
  ): Promise<ContentPatternDocument> {
    return this.patch(id, {
      relevanceWeight: Math.max(0, Math.min(1, weight)),
    });
  }

  async deleteByCreator(creatorId: string): Promise<{ count: number }> {
    const result = (await this.delegate.updateMany({
      where: { isDeleted: false, sourceCreatorId: creatorId },
      data: { isDeleted: true },
    })) as { count: number };
    return { count: result.count };
  }
}
