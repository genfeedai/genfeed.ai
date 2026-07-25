import { CreateCampaignTargetDto } from '@api/collections/campaign-targets/dto/create-campaign-target.dto';
import { UpdateCampaignTargetDto } from '@api/collections/campaign-targets/dto/update-campaign-target.dto';
import type { CampaignTargetDocument } from '@api/collections/campaign-targets/schemas/campaign-target.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { CampaignSkipReason, CampaignTargetStatus } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Create payloads reach this service with relation aliases (`campaign`,
 * `organization`) and descriptive fields (`platform`, `targetType`,
 * `contentUrl`, `recipientUsername`, …) that have no column on
 * `campaign_targets`. They are mapped onto real columns + the `data` JSON
 * payload by `toCreateManyInput`.
 */
type CampaignTargetCreateInput = CreateCampaignTargetDto &
  Record<string, unknown>;

@Injectable()
export class CampaignTargetsService extends BaseService<
  CampaignTargetDocument,
  CreateCampaignTargetDto,
  UpdateCampaignTargetDto,
  Prisma.CampaignTargetWhereInput
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'campaignTarget', logger);
  }

  /**
   * Serialize the descriptive half of a create payload into the `data` JSON
   * column. `Prisma.InputJsonValue` accepts neither `undefined` nor `Date`.
   */
  private toDataPayload(
    source: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    const payload: Record<string, Prisma.InputJsonValue> = {};

    for (const [key, value] of Object.entries(source)) {
      if (value === undefined || value === null) {
        continue;
      }

      payload[key] =
        value instanceof Date
          ? value.toISOString()
          : (value as Prisma.InputJsonValue);
    }

    return payload;
  }

  /**
   * Map an alias-shaped create payload onto the real `campaign_targets`
   * columns. Everything the table has no column for lands in `data`, where
   * `normalizeDocument` merges it back onto the top level on read.
   */
  private toCreateManyInput(
    target: CampaignTargetCreateInput,
  ): Prisma.CampaignTargetCreateManyInput {
    const {
      campaign,
      campaignId,
      externalId,
      isDeleted,
      organization,
      organizationId,
      scheduledAt,
      status,
      ...descriptive
    } = target as CampaignTargetCreateInput & {
      campaignId?: string;
      isDeleted?: boolean;
      organizationId?: string;
      status?: string;
    };

    const resolvedCampaignId = campaignId ?? campaign;
    const resolvedOrganizationId = organizationId ?? organization;

    if (!resolvedCampaignId || !resolvedOrganizationId) {
      throw new BadRequestException(
        'Campaign target requires both a campaign and an organization id',
      );
    }

    return {
      campaignId: resolvedCampaignId,
      data: this.toDataPayload(descriptive),
      organizationId: resolvedOrganizationId,
      status: status ?? CampaignTargetStatus.PENDING,
      ...(externalId === undefined ? {} : { externalId }),
      ...(isDeleted === undefined ? {} : { isDeleted }),
      ...(scheduledAt === undefined ? {} : { scheduledAt }),
    };
  }

  /**
   * Create a single target, mapped onto real columns.
   */
  override async create(
    createDto: CreateCampaignTargetDto,
  ): Promise<CampaignTargetDocument> {
    return super.create(
      this.toCreateManyInput(createDto as CampaignTargetCreateInput) as never,
    );
  }

  /**
   * Create multiple targets in a single insert.
   *
   * Returns the number of rows written — a batch insert cannot return the
   * created rows, and no caller needs them.
   */
  async createMany(targets: CampaignTargetCreateInput[]): Promise<number> {
    if (targets.length === 0) {
      return 0;
    }

    const result = await this.prisma.campaignTarget.createMany({
      data: targets.map((target) => this.toCreateManyInput(target)),
    });

    return result.count;
  }

  /**
   * Find a target by ID
   */
  async findById(id: string): Promise<CampaignTargetDocument | null> {
    const target = await this.delegate.findFirst({
      where: { id, isDeleted: false },
    });

    return target ? this.normalizeDocument(target) : null;
  }

  /**
   * Find targets by campaign
   */
  async findByCampaign(campaignId: string): Promise<CampaignTargetDocument[]> {
    const targets = await this.delegate.findMany({
      where: { campaignId, isDeleted: false },
    });

    return this.normalizeDocuments(targets);
  }

  /**
   * Find targets by campaign and status
   */
  async findByCampaignAndStatus(
    campaignId: string,
    status: CampaignTargetStatus,
  ): Promise<CampaignTargetDocument[]> {
    const targets = await this.delegate.findMany({
      where: { campaignId, isDeleted: false, status },
    });

    return this.normalizeDocuments(targets);
  }

  /**
   * Get the next pending target for processing
   */
  async getNextPending(
    campaignId: string,
  ): Promise<CampaignTargetDocument | null> {
    const target = await this.delegate.findFirst({
      where: {
        campaignId,
        isDeleted: false,
        status: CampaignTargetStatus.PENDING,
      },
      orderBy: [{ createdAt: 'asc' }, { scheduledAt: 'asc' }],
    });

    return target ? this.normalizeDocument(target) : null;
  }

  /**
   * Get pending targets that are ready to be processed
   */
  async getPendingTargets(
    campaignId: string,
    limit: number = 10,
  ): Promise<CampaignTargetDocument[]> {
    const now = new Date();

    const targets = await this.delegate.findMany({
      where: {
        campaignId,
        isDeleted: false,
        status: CampaignTargetStatus.PENDING,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
      },
      orderBy: [{ createdAt: 'asc' }, { scheduledAt: 'asc' }],
      take: limit,
    });

    return this.normalizeDocuments(targets);
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
   * Existence check for a whole batch of external IDs in one query.
   *
   * Callers adding N targets used to run N `targetExists` round-trips; this
   * collapses them into a single scoped `findMany`.
   */
  async findExistingExternalIds(
    campaignId: string,
    externalIds: string[],
  ): Promise<Set<string>> {
    const uniqueExternalIds = [...new Set(externalIds.filter(Boolean))];

    if (uniqueExternalIds.length === 0) {
      return new Set<string>();
    }

    const existing = (await this.delegate.findMany({
      select: { externalId: true },
      where: {
        campaignId,
        externalId: { in: uniqueExternalIds },
        isDeleted: false,
      },
    })) as unknown as Array<{ externalId: string | null }>;

    return new Set(
      existing
        .map((target) => target.externalId)
        .filter((externalId): externalId is string => Boolean(externalId)),
    );
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
