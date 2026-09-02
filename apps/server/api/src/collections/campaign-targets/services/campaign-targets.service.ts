import { CreateCampaignTargetDto } from '@api/collections/campaign-targets/dto/create-campaign-target.dto';
import { UpdateCampaignTargetDto } from '@api/collections/campaign-targets/dto/update-campaign-target.dto';
import type { CampaignTargetDocument } from '@api/collections/campaign-targets/schemas/campaign-target.schema';
import {
  type CampaignTargetPatch,
  hydrateCampaignTargetJson,
  mergeCampaignTargetJson,
  parseJsonObject,
  splitCampaignTargetPatch,
  toCampaignTargetDataPayload,
} from '@api/collections/campaign-targets/services/campaign-target-json.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PopulateInput,
} from '@api/shared/services/base/base.service';
import type { PrismaFilter } from '@api/shared/services/base/base-query-normalization.adapter';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import {
  CampaignSkipReason,
  CampaignStatus,
  CampaignTargetStatus,
  CampaignType,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

const SCOPED_METHOD_ERROR =
  'Campaign targets require organization-scoped methods';

const DEFAULT_SCHEDULE_VERSION = 1;

type CampaignTargetRow = {
  data?: unknown;
} & Record<string, unknown>;

type DueTargetClaimOptions = {
  now?: Date;
  scheduleVersion?: number;
};

function dueTargetWhere(now: Date): Prisma.CampaignTargetWhereInput {
  return {
    AND: [
      {
        status: {
          in: [CampaignTargetStatus.PENDING, CampaignTargetStatus.SCHEDULED],
        },
      },
      {
        OR: [
          {
            scheduledAt: null,
            status: CampaignTargetStatus.PENDING,
          },
          { scheduledAt: { lte: now } },
        ],
      },
    ],
  };
}

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

  protected override normalizeDocument(
    document: unknown,
  ): CampaignTargetDocument {
    return hydrateCampaignTargetJson(
      document as CampaignTargetRow,
    ) as CampaignTargetDocument;
  }

  private toCreateManyInput(
    target: CreateCampaignTargetDto,
    organizationId: string,
    campaignId: string,
    inheritedSchedule?: {
      scheduledAt: Date | null;
      scheduleVersion: number;
      status: CampaignTargetStatus;
    },
  ): Prisma.CampaignTargetCreateManyInput {
    const {
      campaignId: _campaignId,
      externalId,
      organizationId: _organizationId,
      scheduledAt,
      scheduleVersion,
      status,
      ...descriptive
    } = target;

    return {
      campaignId,
      data: toCampaignTargetDataPayload(
        descriptive as unknown as Record<string, unknown>,
      ),
      organizationId,
      scheduleVersion:
        scheduleVersion ??
        inheritedSchedule?.scheduleVersion ??
        DEFAULT_SCHEDULE_VERSION,
      status:
        status ?? inheritedSchedule?.status ?? CampaignTargetStatus.PENDING,
      ...(externalId === undefined ? {} : { externalId }),
      ...(scheduledAt === undefined
        ? inheritedSchedule?.scheduledAt
          ? { scheduledAt: inheritedSchedule.scheduledAt }
          : {}
        : { scheduledAt }),
    };
  }

  private inheritedScheduleFromCampaign(campaign: {
    campaignType?: string | null;
    config?: unknown;
  }):
    | {
        scheduledAt: Date | null;
        scheduleVersion: number;
        status: CampaignTargetStatus;
      }
    | undefined {
    if (campaign.campaignType !== CampaignType.SCHEDULED_BLAST) {
      return undefined;
    }

    const config = parseJsonObject(campaign.config);
    const schedule =
      config.schedule &&
      typeof config.schedule === 'object' &&
      !Array.isArray(config.schedule)
        ? (config.schedule as Record<string, unknown>)
        : {};
    const dueAt =
      typeof schedule.dueAt === 'string' ? new Date(schedule.dueAt) : null;
    const hasDueAt = Boolean(dueAt && !Number.isNaN(dueAt.getTime()));
    const version =
      typeof schedule.version === 'number' && Number.isInteger(schedule.version)
        ? schedule.version
        : DEFAULT_SCHEDULE_VERSION;

    return {
      scheduledAt: hasDueAt ? dueAt : null,
      scheduleVersion: version,
      status: CampaignTargetStatus.SCHEDULED,
    };
  }

  private parentWhere(
    organizationId: string,
    requireActiveParent: boolean,
  ): Prisma.OutreachCampaignWhereInput {
    return {
      isDeleted: false,
      organizationId,
      ...(requireActiveParent ? { status: CampaignStatus.ACTIVE } : {}),
    };
  }

  /**
   * Create a single target under the parent campaign's organization.
   */
  override async create(
    createDto: CreateCampaignTargetDto,
  ): Promise<CampaignTargetDocument> {
    if (!createDto.campaignId || !createDto.organizationId) {
      throw new BadRequestException(
        'Campaign target requires a campaign and organization id',
      );
    }

    const added = await this.createManyForCampaign(
      createDto.campaignId,
      createDto.organizationId,
      [createDto],
    );

    if (added !== 1) {
      throw new NotFoundException('CampaignTarget');
    }

    const created = await this.prisma.campaignTarget.findFirst({
      orderBy: { createdAt: 'desc' },
      where: scopedWhere(createDto.organizationId, {
        campaignId: createDto.campaignId,
        campaign: this.parentWhere(createDto.organizationId, false),
        ...(createDto.externalId ? { externalId: createDto.externalId } : {}),
      }),
    });

    if (!created) {
      throw new NotFoundException('CampaignTarget');
    }

    return this.normalizeDocument(created);
  }

  /**
   * Insert targets and bump `totalTargets` in one transaction. Organization
   * is always derived from the parent campaign; DTO ownership is ignored.
   */
  async createManyForCampaign(
    campaignId: string,
    organizationId: string,
    targets: CreateCampaignTargetDto[],
  ): Promise<number> {
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    if (targets.length === 0) {
      return 0;
    }

    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.outreachCampaign.findFirst({
        where: scopedWhere(organizationId, { id: campaignId }),
      });

      if (!campaign) {
        throw new NotFoundException('Campaign', campaignId);
      }

      const ownerOrganizationId = campaign.organizationId;
      const inheritedSchedule = this.inheritedScheduleFromCampaign(campaign);
      const result = await tx.campaignTarget.createMany({
        data: targets.map((target) =>
          this.toCreateManyInput(
            target,
            ownerOrganizationId,
            campaign.id,
            inheritedSchedule,
          ),
        ),
      });

      if (result.count === 0) {
        return 0;
      }

      const cfg = parseJsonObject(campaign.config);
      const updated = await tx.outreachCampaign.updateMany({
        data: {
          config: {
            ...cfg,
            totalTargets: Number(cfg.totalTargets ?? 0) + result.count,
          } as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
        where: scopedWhere(ownerOrganizationId, { id: campaign.id }),
      });

      if (updated.count !== 1) {
        throw new NotFoundException('Campaign', campaignId);
      }

      return result.count;
    });
  }

  async createMany(targets: CreateCampaignTargetDto[]): Promise<number> {
    if (targets.length === 0) {
      return 0;
    }

    const campaignId = targets[0]?.campaignId;
    const organizationId = targets[0]?.organizationId;

    if (!campaignId || !organizationId) {
      throw new BadRequestException(
        'Campaign target requires a campaign and organization id',
      );
    }

    if (
      targets.some(
        (target) =>
          target.campaignId !== campaignId ||
          (target.organizationId !== undefined &&
            target.organizationId !== organizationId),
      )
    ) {
      throw new BadRequestException(
        'Campaign target batches must share one campaign and organization',
      );
    }

    return this.createManyForCampaign(campaignId, organizationId, targets);
  }

  async findById(
    id: string,
    organizationId: string,
    campaignId?: string,
  ): Promise<CampaignTargetDocument | null> {
    const target = await this.prisma.campaignTarget.findFirst({
      where: scopedWhere(organizationId, {
        id,
        ...(campaignId ? { campaignId } : {}),
        campaign: this.parentWhere(organizationId, false),
      }),
    });

    return target ? this.normalizeDocument(target) : null;
  }

  async findByCampaign(
    campaignId: string,
    organizationId: string,
  ): Promise<CampaignTargetDocument[]> {
    const targets = await this.prisma.campaignTarget.findMany({
      where: scopedWhere(organizationId, {
        campaignId,
        campaign: this.parentWhere(organizationId, false),
      }),
    });

    return this.normalizeDocuments(targets);
  }

  async findByCampaignAndStatus(
    campaignId: string,
    organizationId: string,
    status: CampaignTargetStatus,
  ): Promise<CampaignTargetDocument[]> {
    const targets = await this.prisma.campaignTarget.findMany({
      where: scopedWhere(organizationId, {
        campaignId,
        campaign: this.parentWhere(organizationId, false),
        status,
      }),
    });

    return this.normalizeDocuments(targets);
  }

  async getNextPending(
    campaignId: string,
    organizationId: string,
    options: DueTargetClaimOptions = {},
  ): Promise<CampaignTargetDocument | null> {
    const now = options.now ?? new Date();
    const target = await this.prisma.campaignTarget.findFirst({
      orderBy: [{ createdAt: 'asc' }, { scheduledAt: 'asc' }],
      where: scopedWhere(organizationId, {
        campaignId,
        campaign: this.parentWhere(organizationId, true),
        ...dueTargetWhere(now),
        ...(options.scheduleVersion === undefined
          ? {}
          : { scheduleVersion: options.scheduleVersion }),
      }),
    });

    return target ? this.normalizeDocument(target) : null;
  }

  async getPendingTargets(
    campaignId: string,
    organizationId: string,
    limit: number = 10,
    options: DueTargetClaimOptions = {},
  ): Promise<CampaignTargetDocument[]> {
    const now = options.now ?? new Date();

    const targets = await this.prisma.campaignTarget.findMany({
      orderBy: [{ createdAt: 'asc' }, { scheduledAt: 'asc' }],
      take: limit,
      where: scopedWhere(organizationId, {
        campaignId,
        campaign: this.parentWhere(organizationId, true),
        ...dueTargetWhere(now),
        ...(options.scheduleVersion === undefined
          ? {}
          : { scheduleVersion: options.scheduleVersion }),
      }),
    });

    return this.normalizeDocuments(targets);
  }

  /**
   * Atomic scoped claim: at most one worker can move an eligible pending
   * or due scheduled target into PROCESSING under an ACTIVE, non-deleted
   * parent. Stale schedule versions and not-yet-due rows match zero rows.
   */
  async claimForProcessing(
    id: string,
    organizationId: string,
    options: DueTargetClaimOptions = {},
  ): Promise<CampaignTargetDocument | null> {
    const now = options.now ?? new Date();
    const claimed = await this.prisma.campaignTarget.updateMany({
      data: { status: CampaignTargetStatus.PROCESSING },
      where: scopedWhere(organizationId, {
        campaign: this.parentWhere(organizationId, true),
        id,
        ...dueTargetWhere(now),
        ...(options.scheduleVersion === undefined
          ? {}
          : { scheduleVersion: options.scheduleVersion }),
      }),
    });

    if (claimed.count !== 1) {
      return null;
    }

    return this.findById(id, organizationId);
  }

  markAsProcessing(
    id: string,
    organizationId: string,
  ): Promise<CampaignTargetDocument | null> {
    return this.claimForProcessing(id, organizationId);
  }

  markAsReplied(
    id: string,
    organizationId: string,
    replyData: {
      replyText: string;
      replyExternalId: string;
      replyUrl: string;
    },
  ): Promise<CampaignTargetDocument | null> {
    return this.transitionClaimedTarget(id, organizationId, {
      processedAt: new Date(),
      replyExternalId: replyData.replyExternalId,
      replyText: replyData.replyText,
      replyUrl: replyData.replyUrl,
      status: CampaignTargetStatus.REPLIED,
    });
  }

  markAsFailed(
    id: string,
    organizationId: string,
    errorMessage: string,
    retryCount: number = 0,
  ): Promise<CampaignTargetDocument | null> {
    return this.transitionClaimedTarget(id, organizationId, {
      errorMessage,
      processedAt: new Date(),
      retryCount,
      status: CampaignTargetStatus.FAILED,
    });
  }

  markAsSkipped(
    id: string,
    organizationId: string,
    skipReason: CampaignSkipReason,
    expectedStatus: CampaignTargetStatus = CampaignTargetStatus.PENDING,
  ): Promise<CampaignTargetDocument | null> {
    return this.transitionTarget(
      id,
      organizationId,
      expectedStatus,
      {
        processedAt: new Date(),
        skipReason,
        status: CampaignTargetStatus.SKIPPED,
      },
      { requireActiveParent: false },
    );
  }

  markAsSent(
    id: string,
    organizationId: string,
    sent: { dmText: string; dmSentAt?: Date },
  ): Promise<CampaignTargetDocument | null> {
    return this.transitionClaimedTarget(
      id,
      organizationId,
      {
        processedAt: new Date(),
        status: CampaignTargetStatus.SENT,
      },
      {
        dmSentAt: sent.dmSentAt ?? new Date(),
        dmText: sent.dmText,
      },
    );
  }

  async scheduleTarget(
    id: string,
    organizationId: string,
    scheduledAt: Date,
    options: DueTargetClaimOptions = {},
  ): Promise<CampaignTargetDocument | null> {
    const now = options.now ?? new Date();
    if (scheduledAt.getTime() <= now.getTime()) {
      throw new BadRequestException('Delivery time must be in the future.');
    }

    const existing = await this.findById(id, organizationId);
    if (!existing) {
      return null;
    }

    if (
      existing.status !== CampaignTargetStatus.PENDING &&
      existing.status !== CampaignTargetStatus.SCHEDULED
    ) {
      return null;
    }

    const nextVersion =
      (typeof existing.scheduleVersion === 'number'
        ? existing.scheduleVersion
        : DEFAULT_SCHEDULE_VERSION) + 1;

    return this.transitionTarget(
      id,
      organizationId,
      existing.status as CampaignTargetStatus,
      {
        scheduledAt,
        scheduleVersion: nextVersion,
        status: CampaignTargetStatus.SCHEDULED,
      },
      { requireActiveParent: true },
    );
  }

  async applyScheduleToOpenTargets(
    campaignId: string,
    organizationId: string,
    schedule: { scheduledAt: Date; scheduleVersion: number },
  ): Promise<number> {
    const result = await this.prisma.campaignTarget.updateMany({
      data: {
        scheduledAt: schedule.scheduledAt,
        scheduleVersion: schedule.scheduleVersion,
        status: CampaignTargetStatus.SCHEDULED,
      },
      where: scopedWhere(organizationId, {
        campaignId,
        campaign: this.parentWhere(organizationId, false),
        status: {
          in: [CampaignTargetStatus.PENDING, CampaignTargetStatus.SCHEDULED],
        },
      }),
    });

    return result.count;
  }

  async cancelTarget(
    id: string,
    organizationId: string,
  ): Promise<CampaignTargetDocument | null> {
    const existing = await this.findById(id, organizationId);
    if (
      !existing ||
      (existing.status !== CampaignTargetStatus.PENDING &&
        existing.status !== CampaignTargetStatus.SCHEDULED)
    ) {
      return null;
    }

    return this.transitionTarget(
      id,
      organizationId,
      existing.status as CampaignTargetStatus,
      {
        processedAt: new Date(),
        skipReason: CampaignSkipReason.MANUAL_SKIP,
        status: CampaignTargetStatus.SKIPPED,
      },
      { requireActiveParent: false },
    );
  }

  updateOne(
    id: string,
    organizationId: string,
    update: CampaignTargetPatch,
  ): Promise<CampaignTargetDocument | null> {
    return this.updateTargetData(id, organizationId, update);
  }

  async updateTargetData(
    id: string,
    organizationId: string,
    update: CampaignTargetPatch,
  ): Promise<CampaignTargetDocument | null> {
    const existing = await this.prisma.campaignTarget.findFirst({
      where: scopedWhere(organizationId, {
        campaign: this.parentWhere(organizationId, false),
        id,
      }),
    });

    if (!existing) {
      return null;
    }

    const { columns, json } = splitCampaignTargetPatch(update);
    const hasJson = Object.keys(json).length > 0;
    const updated = await this.prisma.campaignTarget.updateMany({
      data: {
        ...columns,
        ...(hasJson
          ? { data: mergeCampaignTargetJson(existing.data, json) }
          : {}),
      },
      where: scopedWhere(organizationId, {
        campaign: this.parentWhere(organizationId, false),
        id,
      }),
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findById(id, organizationId);
  }

  async targetExists(
    campaignId: string,
    organizationId: string,
    externalId: string,
  ): Promise<boolean> {
    const target = await this.prisma.campaignTarget.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, {
        campaignId,
        campaign: this.parentWhere(organizationId, false),
        externalId,
      }),
    });

    return Boolean(target);
  }

  async findExistingExternalIds(
    campaignId: string,
    organizationId: string,
    externalIds: string[],
  ): Promise<Set<string>> {
    const uniqueExternalIds = [...new Set(externalIds.filter(Boolean))];

    if (uniqueExternalIds.length === 0) {
      return new Set<string>();
    }

    const existing = await this.prisma.campaignTarget.findMany({
      select: { externalId: true },
      where: scopedWhere(organizationId, {
        campaignId,
        campaign: this.parentWhere(organizationId, false),
        externalId: { in: uniqueExternalIds },
      }),
    });

    return new Set(
      existing
        .map((target) => target.externalId)
        .filter((externalId): externalId is string => Boolean(externalId)),
    );
  }

  async getTargetStats(
    campaignId: string,
    organizationId: string,
  ): Promise<{
    total: number;
    pending: number;
    scheduled: number;
    processing: number;
    replied: number;
    skipped: number;
    failed: number;
  }> {
    const parent = this.parentWhere(organizationId, false);
    const countByStatus = (status?: CampaignTargetStatus) =>
      this.prisma.campaignTarget.count({
        where: scopedWhere(organizationId, {
          campaignId,
          campaign: parent,
          ...(status ? { status } : {}),
        }),
      });

    const [total, pending, scheduled, processing, replied, skipped, failed] =
      await Promise.all([
        countByStatus(),
        countByStatus(CampaignTargetStatus.PENDING),
        countByStatus(CampaignTargetStatus.SCHEDULED),
        countByStatus(CampaignTargetStatus.PROCESSING),
        countByStatus(CampaignTargetStatus.REPLIED),
        countByStatus(CampaignTargetStatus.SKIPPED),
        countByStatus(CampaignTargetStatus.FAILED),
      ]);

    return { failed, pending, processing, replied, scheduled, skipped, total };
  }

  async resetFailedTargets(
    campaignId: string,
    organizationId: string,
  ): Promise<number> {
    const result = await this.prisma.campaignTarget.updateMany({
      data: {
        retryCount: { increment: 1 },
        status: CampaignTargetStatus.PENDING,
      },
      where: scopedWhere(organizationId, {
        campaignId,
        campaign: this.parentWhere(organizationId, false),
        status: CampaignTargetStatus.FAILED,
      }),
    });

    return result.count;
  }

  override async find(
    _params?: PrismaFilter,
    _populate?: PopulateInput,
  ): Promise<CampaignTargetDocument[]> {
    throw new BadRequestException(SCOPED_METHOD_ERROR);
  }

  override async findOne(
    _params?: PrismaFilter,
    _populate?: PopulateInput,
  ): Promise<CampaignTargetDocument | null> {
    throw new BadRequestException(SCOPED_METHOD_ERROR);
  }

  override async findAll(
    _input?: unknown,
    _options?: unknown,
  ): Promise<AggregatePaginateResult<CampaignTargetDocument>> {
    throw new BadRequestException(SCOPED_METHOD_ERROR);
  }

  override async patch(
    _id: string,
    _updateDto?: unknown,
  ): Promise<CampaignTargetDocument> {
    throw new BadRequestException(SCOPED_METHOD_ERROR);
  }

  override async patchAll(
    _filter?: PrismaFilter,
    _update?: unknown,
  ): Promise<{ modifiedCount: number }> {
    throw new BadRequestException(SCOPED_METHOD_ERROR);
  }

  override async remove(_id: string): Promise<CampaignTargetDocument | null> {
    throw new BadRequestException(SCOPED_METHOD_ERROR);
  }

  private async transitionClaimedTarget(
    id: string,
    organizationId: string,
    data: Prisma.CampaignTargetUpdateManyMutationInput,
    json?: CampaignTargetPatch,
  ): Promise<CampaignTargetDocument | null> {
    return this.transitionTarget(
      id,
      organizationId,
      CampaignTargetStatus.PROCESSING,
      data,
      { json, requireActiveParent: false },
    );
  }

  private async transitionTarget(
    id: string,
    organizationId: string,
    expectedStatus: CampaignTargetStatus,
    data: Prisma.CampaignTargetUpdateManyMutationInput,
    options: {
      json?: CampaignTargetPatch;
      requireActiveParent: boolean;
    },
  ): Promise<CampaignTargetDocument | null> {
    let nextData = data;

    if (options.json && Object.keys(options.json).length > 0) {
      const existing = await this.prisma.campaignTarget.findFirst({
        where: scopedWhere(organizationId, {
          campaign: this.parentWhere(
            organizationId,
            options.requireActiveParent,
          ),
          id,
          status: expectedStatus,
        }),
      });

      if (!existing) {
        return null;
      }

      const { json } = splitCampaignTargetPatch(options.json);
      nextData = {
        ...data,
        data: mergeCampaignTargetJson(existing.data, json),
      };
    }

    const updated = await this.prisma.campaignTarget.updateMany({
      data: nextData,
      where: scopedWhere(organizationId, {
        campaign: this.parentWhere(organizationId, options.requireActiveParent),
        id,
        status: expectedStatus,
      }),
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findById(id, organizationId);
  }
}
