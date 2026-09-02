import type { ContentPatternDocument } from '@api/collections/content-intelligence/schemas/content-pattern.schema';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { readRecordOrEmpty as readJsonRecord } from '@api/shared/utils/object/read-record-or-empty.util';
import {
  ContentIntelligencePlatform,
  ContentPatternType,
  TemplateCategory,
} from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
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
  tags: string[];
  sourcePostId?: string;
  sourcePostUrl?: string;
  sourcePostDate?: Date;
}

function pickDefined(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );
}

function buildDataFilter(
  path: string[],
  operator: Record<string, unknown>,
): Prisma.ContentPatternWhereInput {
  return { data: { path, ...operator } as Prisma.JsonFilter };
}

@Injectable()
export class PatternStoreService extends BaseService<
  ContentPatternDocument,
  Prisma.ContentPatternUncheckedCreateInput,
  Prisma.ContentPatternUncheckedUpdateInput,
  Prisma.ContentPatternWhereInput
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'contentPattern', logger);
  }

  protected override normalizeDocument(
    document: unknown,
  ): ContentPatternDocument {
    const record = super.normalizeDocument(document) as Record<string, unknown>;
    const data = readJsonRecord(record.data);
    return { ...data, ...record, data } as ContentPatternDocument;
  }

  storePattern(dto: CreatePatternDto): Promise<ContentPatternDocument> {
    const { organizationId, sourceCreatorId, sourcePostDate, ...domainData } =
      dto;
    return this.create({
      data: {
        ...pickDefined(domainData),
        ...(sourcePostDate
          ? { sourcePostDate: sourcePostDate.toISOString() }
          : {}),
        relevanceWeight: 1,
        usageCount: 0,
      } as Prisma.InputJsonObject,
      organizationId,
      sourceCreatorId,
    });
  }

  storeBulkPatterns(
    patterns: CreatePatternDto[],
  ): Promise<ContentPatternDocument[]> {
    return Promise.all(patterns.map((pattern) => this.storePattern(pattern)));
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
    const filtersAnd: Prisma.ContentPatternWhereInput[] = [];

    if (filters?.platform) {
      filtersAnd.push(
        buildDataFilter(['platform'], { equals: filters.platform }),
      );
    }
    if (filters?.patternType) {
      filtersAnd.push(
        buildDataFilter(['patternType'], { equals: filters.patternType }),
      );
    }
    if (filters?.templateCategory) {
      filtersAnd.push(
        buildDataFilter(['templateCategory'], {
          equals: filters.templateCategory,
        }),
      );
    }
    if (filters?.tags && filters.tags.length > 0) {
      filtersAnd.push(
        buildDataFilter(['tags'], { array_contains: filters.tags }),
      );
    }
    if (filters?.minRelevanceWeight !== undefined) {
      filtersAnd.push(
        buildDataFilter(['relevanceWeight'], {
          gte: filters.minRelevanceWeight,
        }),
      );
    }
    if (filters?.minEngagementRate !== undefined) {
      filtersAnd.push(
        buildDataFilter(['sourceMetrics', 'engagementRate'], {
          gte: filters.minEngagementRate,
        }),
      );
    }

    const documents = await this.delegate.findMany({
      where: scopedWhere(organizationId, {
        ...(filters?.sourceCreator
          ? { sourceCreatorId: filters.sourceCreator }
          : {}),
        ...(filtersAnd.length > 0 ? { AND: filtersAnd } : {}),
      }),
      orderBy: [{ createdAt: 'desc' }],
    });
    return this.normalizeDocuments(documents);
  }

  async findByCreator(
    creatorId: string,
    organizationId: string,
  ): Promise<ContentPatternDocument[]> {
    const documents = await this.delegate.findMany({
      where: scopedWhere(organizationId, { sourceCreatorId: creatorId }),
    });
    return this.normalizeDocuments(documents);
  }

  async incrementUsage(id: string): Promise<void> {
    const existing = await this.delegate.findUnique({ where: { id } });
    if (!existing) return;
    const data = readJsonRecord(existing.data);
    await this.delegate.update({
      where: { id },
      data: {
        data: {
          ...data,
          usageCount: Number(data.usageCount ?? 0) + 1,
        } as Prisma.InputJsonObject,
      },
    });
  }

  updateRelevanceWeight(
    id: string,
    weight: number,
  ): Promise<ContentPatternDocument> {
    return this.updatePatternData(id, {
      relevanceWeight: Math.max(0, Math.min(1, weight)),
    });
  }

  private async updatePatternData(
    id: string,
    update: Record<string, unknown>,
  ): Promise<ContentPatternDocument> {
    const existing = await this.delegate.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Content pattern not found');
    }
    return this.patch(id, {
      data: {
        ...readJsonRecord(existing.data),
        ...pickDefined(update),
      } as Prisma.InputJsonObject,
    });
  }

  async deleteByCreator(
    creatorId: string,
    organizationId: string,
  ): Promise<{ count: number }> {
    const result = (await this.delegate.updateMany({
      where: scopedWhere(organizationId, { sourceCreatorId: creatorId }),
      data: { isDeleted: true },
    })) as { count: number };
    return { count: result.count };
  }
}
