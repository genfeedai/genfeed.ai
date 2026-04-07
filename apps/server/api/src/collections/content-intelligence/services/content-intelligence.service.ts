import {
  AddCreatorDto,
  ScrapeConfigDto,
} from '@api/collections/content-intelligence/dto/add-creator.dto';
import {
  CreatorAnalysis,
  type CreatorAnalysisDocument,
} from '@api/collections/content-intelligence/schemas/creator-analysis.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { CreatorAnalysisStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class ContentIntelligenceService extends BaseService<
  CreatorAnalysisDocument,
  AddCreatorDto,
  Partial<AddCreatorDto>
> {
  constructor(
    @InjectModel(CreatorAnalysis.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<CreatorAnalysisDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  addCreator(
    organizationId: Types.ObjectId,
    userId: Types.ObjectId,
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
      organization: organizationId,
      platform: dto.platform,
      profileUrl: dto.profileUrl,
      scrapeConfig,
      status: CreatorAnalysisStatus.PENDING,
      tags: dto.tags ?? [],
    };

    return this.create(creatorData as AddCreatorDto);
  }

  findByHandle(
    organizationId: Types.ObjectId,
    platform: string,
    handle: string,
  ): Promise<CreatorAnalysisDocument | null> {
    return this.findOne({
      handle,
      isDeleted: false,
      organization: organizationId,
      platform,
    });
  }

  findByOrganization(
    organizationId: Types.ObjectId,
  ): Promise<CreatorAnalysisDocument[]> {
    return this.findAllByOrganization(organizationId.toString());
  }

  updateStatus(
    id: Types.ObjectId | string,
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
    id: Types.ObjectId | string,
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
    id: Types.ObjectId | string,
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
