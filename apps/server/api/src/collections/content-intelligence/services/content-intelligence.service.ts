import {
  AddCreatorDto,
  ScrapeConfigDto,
} from '@api/collections/content-intelligence/dto/add-creator.dto';
import type { CreatorAnalysisDocument } from '@api/collections/content-intelligence/schemas/creator-analysis.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { CreatorAnalysisStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ContentIntelligenceService extends BaseService<
  CreatorAnalysisDocument,
  AddCreatorDto,
  Partial<AddCreatorDto>
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'creatorAnalysis', logger);
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

    const creatorData = {
      createdBy: userId,
      displayName: dto.displayName,
      handle: dto.handle,
      niche: dto.niche,
      organizationId,
      platform: dto.platform,
      profileUrl: dto.profileUrl,
      scrapeConfig,
      status: CreatorAnalysisStatus.PENDING,
      tags: dto.tags ?? [],
    };

    return this.create(creatorData as AddCreatorDto);
  }

  findByHandle(
    organizationId: string,
    platform: string,
    handle: string,
  ): Promise<CreatorAnalysisDocument | null> {
    return this.findOne({
      handle,
      isDeleted: false,
      organizationId,
      platform,
    });
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
      updateData.lastScrapedAt = new Date();
    }
    return this.patch(id, updateData);
  }

  updateMetrics(
    id: string,
    metrics: Record<string, unknown>,
    postsScraped: number,
    patternsExtracted: number,
  ): Promise<CreatorAnalysisDocument> {
    return this.patch(id, {
      metrics,
      patternsExtracted,
      postsScraped,
    } as Partial<AddCreatorDto>);
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
    return this.patch(id, profileData as Partial<AddCreatorDto>);
  }
}
