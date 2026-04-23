import { CreateCampaignTargetDto } from '@api/collections/campaign-targets/dto/create-campaign-target.dto';
import { UpdateCampaignTargetDto } from '@api/collections/campaign-targets/dto/update-campaign-target.dto';
import type { CampaignTargetDocument } from '@api/collections/campaign-targets/schemas/campaign-target.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { CampaignSkipReason, CampaignTargetStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CampaignTargetsService extends BaseService<
  CampaignTargetDocument,
  CreateCampaignTargetDto,
  UpdateCampaignTargetDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'campaignTarget', logger);
  }

  /**
   * Create multiple targets at once
   */
  async createMany(
    targets: CreateCampaignTargetDto[],
  ): Promise<CampaignTargetDocument[]> {
    const created = await Promise.all(
      targets.map((t) =>
        this.delegate.create({
          data: t as unknown as Record<string, unknown>,
        }),
      ),
    );
    return created as CampaignTargetDocument[];
  }

  /**
   * Find a target by ID
   */
  findById(id: string): Promise<CampaignTargetDocument | null> {
    return this.delegate.findFirst({
      where: { id, isDeleted: false },
    }) as Promise<CampaignTargetDocument | null>;
  }

  /**
   * Find targets by campaign
   */
  findByCampaign(campaignId: string): Promise<CampaignTargetDocument[]> {
    return this.delegate.findMany({
      where: { campaignId, isDeleted: false },
    }) as Promise<CampaignTargetDocument[]>;
  }

  /**
   * Find targets by campaign and status
   */
  findByCampaignAndStatus(
    campaignId: string,
    status: CampaignTargetStatus,
  ): Promise<CampaignTargetDocument[]> {
    return this.delegate.findMany({
      where: { campaignId, isDeleted: false, status },
    }) as Promise<CampaignTargetDocument[]>;
  }

  /**
   * Get the next pending target for processing
   */
  getNextPending(campaignId: string): Promise<CampaignTargetDocument | null> {
    return this.delegate.findFirst({
      where: {
        campaignId,
        isDeleted: false,
        status: CampaignTargetStatus.PENDING,
      },
      orderBy: [{ createdAt: 'asc' }, { scheduledAt: 'asc' }],
    }) as Promise<CampaignTargetDocument | null>;
  }

  /**
   * Get pending targets that are ready to be processed
   */
  getPendingTargets(
    campaignId: string,
    limit: number = 10,
  ): Promise<CampaignTargetDocument[]> {
    const now = new Date();

    return this.delegate.findMany({
      where: {
        campaignId,
        isDeleted: false,
        status: CampaignTargetStatus.PENDING,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
      },
      orderBy: [{ createdAt: 'asc' }, { scheduledAt: 'asc' }],
      take: limit,
    }) as Promise<CampaignTargetDocument[]>;
  }

  /**
   * Mark a target as processing
   */
  markAsProcessing(id: string): Promise<CampaignTargetDocument | null> {
    return this.delegate.update({
      where: { id },
      data: { status: CampaignTargetStatus.PROCESSING },
    }) as Promise<CampaignTargetDocument>;
  }

  /**
   * Mark a target as replied
   */
  markAsReplied(
    id: string,
    replyData: {
      replyText: string;
      replyExternalId: string;
      replyUrl: string;
    },
  ): Promise<CampaignTargetDocument | null> {
    return this.delegate.update({
      where: { id },
      data: {
        processedAt: new Date(),
        replyExternalId: replyData.replyExternalId,
        replyText: replyData.replyText,
        replyUrl: replyData.replyUrl,
        status: CampaignTargetStatus.REPLIED,
      },
    }) as Promise<CampaignTargetDocument>;
  }

  /**
   * Mark a target as failed
   */
  markAsFailed(
    id: string,
    errorMessage: string,
    retryCount: number = 0,
  ): Promise<CampaignTargetDocument | null> {
    return this.delegate.update({
      where: { id },
      data: {
        errorMessage,
        processedAt: new Date(),
        retryCount,
        status: CampaignTargetStatus.FAILED,
      },
    }) as Promise<CampaignTargetDocument>;
  }

  /**
   * Mark a target as skipped
   */
  markAsSkipped(
    id: string,
    skipReason: CampaignSkipReason,
  ): Promise<CampaignTargetDocument | null> {
    return this.delegate.update({
      where: { id },
      data: {
        processedAt: new Date(),
        skipReason,
        status: CampaignTargetStatus.SKIPPED,
      },
    }) as Promise<CampaignTargetDocument>;
  }

  /**
   * Schedule a target for future processing
   */
  scheduleTarget(
    id: string,
    scheduledAt: Date,
  ): Promise<CampaignTargetDocument | null> {
    return this.delegate.update({
      where: { id },
      data: {
        scheduledAt,
        status: CampaignTargetStatus.SCHEDULED,
      },
    }) as Promise<CampaignTargetDocument>;
  }

  /**
   * Update a single target by ID
   */
  updateOne(
    id: string,
    update: Record<string, unknown>,
  ): Promise<CampaignTargetDocument | null> {
    return this.delegate.update({
      where: { id },
      data: update,
    }) as Promise<CampaignTargetDocument>;
  }

  /**
   * Check if a target already exists (by external ID)
   */
  async targetExists(campaignId: string, externalId: string): Promise<boolean> {
    const target = await this.delegate.findFirst({
      where: { campaignId, externalId, isDeleted: false },
    });

    return !!target;
  }

  /**
   * Get target statistics for a campaign
   */
  async getTargetStats(campaignId: string): Promise<{
    total: number;
    pending: number;
    scheduled: number;
    processing: number;
    replied: number;
    skipped: number;
    failed: number;
  }> {
    const [total, pending, scheduled, processing, replied, skipped, failed] =
      await Promise.all([
        this.delegate.count({
          where: { campaignId, isDeleted: false },
        }) as Promise<number>,
        this.delegate.count({
          where: {
            campaignId,
            isDeleted: false,
            status: CampaignTargetStatus.PENDING,
          },
        }) as Promise<number>,
        this.delegate.count({
          where: {
            campaignId,
            isDeleted: false,
            status: CampaignTargetStatus.SCHEDULED,
          },
        }) as Promise<number>,
        this.delegate.count({
          where: {
            campaignId,
            isDeleted: false,
            status: CampaignTargetStatus.PROCESSING,
          },
        }) as Promise<number>,
        this.delegate.count({
          where: {
            campaignId,
            isDeleted: false,
            status: CampaignTargetStatus.REPLIED,
          },
        }) as Promise<number>,
        this.delegate.count({
          where: {
            campaignId,
            isDeleted: false,
            status: CampaignTargetStatus.SKIPPED,
          },
        }) as Promise<number>,
        this.delegate.count({
          where: {
            campaignId,
            isDeleted: false,
            status: CampaignTargetStatus.FAILED,
          },
        }) as Promise<number>,
      ]);

    return { failed, pending, processing, replied, scheduled, skipped, total };
  }

  /**
   * Reset failed targets for retry
   */
  async resetFailedTargets(campaignId: string): Promise<number> {
    const result = (await this.delegate.updateMany({
      where: {
        campaignId,
        isDeleted: false,
        status: CampaignTargetStatus.FAILED,
      },
      data: {
        retryCount: { increment: 1 },
        status: CampaignTargetStatus.PENDING,
      },
    })) as { count: number };

    return result.count;
  }
}
