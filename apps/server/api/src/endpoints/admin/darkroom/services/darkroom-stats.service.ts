import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { DarkroomValueReader } from '@api/endpoints/admin/darkroom/services/darkroom-value-reader.util';
import { DarkroomReviewStatus as DarkroomReviewStatusEnum } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

/**
 * Owns darkroom pipeline aggregation (campaigns + pipeline stats). Reads
 * aggregates through the owning collection services rather than touching their
 * Prisma client directly.
 */
@Injectable()
export class DarkroomStatsService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly trainingsService: TrainingsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * List campaigns with asset counts.
   */
  async listCampaigns(organizationId: string): Promise<
    {
      campaign: string;
      assetCount: number;
      approvedCount: number;
      createdAt: string;
      status: 'active' | 'completed' | 'draft';
    }[]
  > {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { organizationId });

    const campaignGroups =
      await this.ingredientsService.groupPersonaAssetCampaigns(organizationId);

    const campaigns = new Map<
      string,
      {
        approvedCount: number;
        assetCount: number;
        campaign: string;
        createdAt?: Date;
      }
    >();

    for (const group of campaignGroups) {
      if (!group.campaign) {
        continue;
      }

      const existing = campaigns.get(group.campaign) ?? {
        approvedCount: 0,
        assetCount: 0,
        campaign: group.campaign,
        createdAt: group.earliestCreatedAt ?? undefined,
      };

      existing.assetCount += group.count;

      if (
        DarkroomValueReader.hasReviewStatus(
          group.reviewStatus,
          DarkroomReviewStatusEnum.APPROVED,
        )
      ) {
        existing.approvedCount += group.count;
      }

      if (
        group.earliestCreatedAt &&
        (!existing.createdAt || group.earliestCreatedAt < existing.createdAt)
      ) {
        existing.createdAt = group.earliestCreatedAt;
      }

      campaigns.set(group.campaign, existing);
    }

    return Array.from(campaigns.values()).map((campaign) => ({
      approvedCount: campaign.approvedCount,
      assetCount: campaign.assetCount,
      campaign: campaign.campaign,
      createdAt: (campaign.createdAt ?? new Date(0)).toISOString(),
      status:
        campaign.approvedCount === 0
          ? 'draft'
          : campaign.approvedCount >= campaign.assetCount
            ? 'completed'
            : 'active',
    }));
  }

  /**
   * Get pipeline statistics aggregating assets and trainings.
   */
  async getPipelineStats(organizationId: string): Promise<{
    assets: {
      total: number;
      byStatus: Record<string, number>;
      byReviewStatus: Record<string, number>;
    };
    trainings: {
      total: number;
      byStage: Record<string, number>;
    };
  }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { organizationId });

    const [
      assetTotal,
      assetStatusGroups,
      assetReviewStatusGroups,
      trainingTotal,
      trainingStageGroups,
    ] = await Promise.all([
      this.ingredientsService.countPersonaAssets(organizationId),
      this.ingredientsService.groupPersonaAssetsByStatus(organizationId),
      this.ingredientsService.groupPersonaAssetsByReviewStatus(organizationId),
      this.trainingsService.countTrainingsByOrganization(organizationId),
      this.trainingsService.groupTrainingsByStage(organizationId),
    ]);

    const byStatus: Record<string, number> = {};
    for (const item of assetStatusGroups) {
      byStatus[DarkroomValueReader.readString(item.status) ?? 'unknown'] =
        item.count;
    }

    const byReviewStatus: Record<string, number> = {};
    for (const item of assetReviewStatusGroups) {
      byReviewStatus[
        DarkroomValueReader.readString(item.reviewStatus) ?? 'unknown'
      ] = item.count;
    }

    const byStage: Record<string, number> = {};
    for (const item of trainingStageGroups) {
      byStage[DarkroomValueReader.readString(item.stage) ?? 'unknown'] =
        item.count;
    }

    return {
      assets: {
        byReviewStatus,
        byStatus,
        total: assetTotal,
      },
      trainings: {
        byStage,
        total: trainingTotal,
      },
    };
  }
}
