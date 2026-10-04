import {
  AddCreatorDto,
  ScrapeConfigDto,
} from '@api/collections/content-intelligence/dto/add-creator.dto';
import type { CreatorAnalysisDocument } from '@api/collections/content-intelligence/schemas/creator-analysis.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { readRecordOrEmpty } from '@api/shared/utils/object/read-record-or-empty.util';
import { CreatorAnalysisStatus } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ContentIntelligenceService extends BaseService<
  CreatorAnalysisDocument,
  Prisma.CreatorAnalysisUncheckedCreateInput,
  Prisma.CreatorAnalysisUncheckedUpdateInput,
  Prisma.CreatorAnalysisWhereInput
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'creatorAnalysis', logger);
  }

  protected override normalizeDocument(
    document: unknown,
  ): CreatorAnalysisDocument {
    const record = super.normalizeDocument(document) as Record<string, unknown>;
    const data = readRecordOrEmpty(record.data);
    return { ...data, ...record, data } as CreatorAnalysisDocument;
  }

  private pickDefined(
    values: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    );
  }

  addCreator(
    organizationId: string,
    userId: string,
    dto: AddCreatorDto,
  ): Promise<CreatorAnalysisDocument> {
    const scrapeConfig: ScrapeConfigDto = {
      dateRangeDays: dto.scrapeConfig?.dateRangeDays ?? 90,
      includeReplies: dto.scrapeConfig?.includeReplies ?? false,
      maxPosts: dto.scrapeConfig?.maxPosts ?? 100,
    };

    return this.create({
      createdById: userId,
      data: this.pickDefined({
        displayName: dto.displayName,
        handle: dto.handle,
        niche: dto.niche,
        platform: dto.platform,
        profileUrl: dto.profileUrl,
        scrapeConfig,
        status: CreatorAnalysisStatus.PENDING,
        tags: dto.tags ?? [],
      }) as Prisma.InputJsonObject,
      organizationId,
    });
  }

  findByHandle(
    organizationId: string,
    platform: string,
    handle: string,
  ): Promise<CreatorAnalysisDocument | null> {
    return this.findOne(
      scopedWhere(organizationId, {
        AND: [
          { data: { path: ['handle'], equals: handle } },
          { data: { path: ['platform'], equals: platform } },
        ],
      }),
    );
  }

  findByOrganization(
    organizationId: string,
  ): Promise<CreatorAnalysisDocument[]> {
    return this.findAllByOrganization(organizationId);
  }

  updateStatus(
    id: string,
    organizationId: string,
    status: CreatorAnalysisStatus,
    errorMessage?: string,
  ): Promise<CreatorAnalysisDocument> {
    const updateData: Record<string, unknown> = { status };
    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }
    if (status === CreatorAnalysisStatus.COMPLETED) {
      updateData.lastScrapedAt = new Date().toISOString();
    }
    return this.updateData(id, organizationId, updateData);
  }

  updateMetrics(
    id: string,
    organizationId: string,
    metrics: Record<string, unknown>,
    postsScraped: number,
    patternsExtracted: number,
  ): Promise<CreatorAnalysisDocument> {
    return this.updateData(id, organizationId, {
      metrics,
      patternsExtracted,
      postsScraped,
    });
  }

  updateCreatorProfile(
    id: string,
    organizationId: string,
    profileData: {
      displayName?: string;
      avatarUrl?: string;
      bio?: string;
      followerCount?: number;
      followingCount?: number;
    },
  ): Promise<CreatorAnalysisDocument> {
    return this.updateData(id, organizationId, profileData);
  }

  private async updateData(
    id: string,
    organizationId: string,
    update: Record<string, unknown>,
  ): Promise<CreatorAnalysisDocument> {
    const where = scopedWhere(organizationId, { id });
    const existing = await this.delegate.findFirst({ where });
    if (!existing) {
      throw new NotFoundException('Creator analysis');
    }
    const updated = await this.patchOneWhere(where, {
      data: {
        ...readRecordOrEmpty(existing.data),
        ...this.pickDefined(update),
      } as Prisma.InputJsonObject,
    });
    if (!updated) {
      throw new NotFoundException('Creator analysis');
    }
    return updated;
  }
}
