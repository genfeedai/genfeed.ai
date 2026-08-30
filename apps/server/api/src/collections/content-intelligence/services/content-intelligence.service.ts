import {
  AddCreatorDto,
  ScrapeConfigDto,
} from '@api/collections/content-intelligence/dto/add-creator.dto';
import type { CreatorAnalysisDocument } from '@api/collections/content-intelligence/schemas/creator-analysis.schema';
import { CreatorAnalysisStatus } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { BaseService } from '@server/shared/services/base/base.service';
import { readRecordOrEmpty } from '@server/shared/utils/object/read-record-or-empty.util';

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
    return this.updateData(id, updateData);
  }

  updateMetrics(
    id: string,
    metrics: Record<string, unknown>,
    postsScraped: number,
    patternsExtracted: number,
  ): Promise<CreatorAnalysisDocument> {
    return this.updateData(id, {
      metrics,
      patternsExtracted,
      postsScraped,
    });
  }

  updateCreatorProfile(
    id: string,
    profileData: {
      displayName?: string;
      avatarUrl?: string;
      bio?: string;
      followerCount?: number;
      followingCount?: number;
    },
  ): Promise<CreatorAnalysisDocument> {
    return this.updateData(id, profileData);
  }

  private async updateData(
    id: string,
    update: Record<string, unknown>,
  ): Promise<CreatorAnalysisDocument> {
    const existing = await this.delegate.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Creator analysis');
    }
    return this.patch(id, {
      data: {
        ...readRecordOrEmpty(existing.data),
        ...this.pickDefined(update),
      } as Prisma.InputJsonObject,
    });
  }
}
