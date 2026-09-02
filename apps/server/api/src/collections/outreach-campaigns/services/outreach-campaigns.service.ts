import { CreateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/create-outreach-campaign.dto';
import { UpdateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/update-outreach-campaign.dto';
import type {
  CampaignRateLimits,
  OutreachCampaignDocument,
} from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import {
  DEFAULT_CAMPAIGN_SCHEDULE_VERSION,
  isScheduledBlastDueForDispatch,
  type PersistedCampaignSchedule,
  persistScheduledBlastSchedule,
  readCampaignScheduleDueAt,
  readCampaignScheduleVersion,
  requireScheduledBlastSchedule,
  toOutreachScheduleException,
} from '@api/collections/outreach-campaigns/services/outreach-campaign-schedule.util';
import {
  evaluateReplySlotReservation,
  mergeReservedRateLimits,
} from '@api/collections/outreach-campaigns/services/outreach-reply-slot.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import {
  requireExecutableOutreachPair,
  requireInactiveOutreachCapabilityChange,
} from '@api/services/campaign/outreach-capability.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { PrismaFindAllInput } from '@api/shared/services/base/base.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import {
  CampaignStatus,
  CampaignTargetStatus,
  CampaignType,
  toPrismaCredentialPlatform,
} from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

const SCOPED_FIND_ERROR =
  'Use findActiveForDispatch or a scoped campaign finder';

const PRISMA_SERIALIZATION_FAILURE = 'P2034';
const MAX_SERIALIZATION_RETRIES = 3;

export type ReplySlotReservationResult = {
  reserved: boolean;
};

function isPrismaSerializationFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === PRISMA_SERIALIZATION_FAILURE
  );
}

// ---------------------------------------------------------------------------
// Helper: defensively parse the `config` JSON column
// ---------------------------------------------------------------------------
function parseConfig(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Helper: normalize a raw Prisma record → OutreachCampaignDocument
// The Prisma model owns all relation ids. Domain-only settings live in config.
// ---------------------------------------------------------------------------
function normalizeDoc(row: Record<string, unknown>): OutreachCampaignDocument {
  const cfg = parseConfig(row.config);
  return {
    ...cfg,
    brandId: row.brandId,
    campaignType: row.campaignType,
    config: cfg,
    createdAt: row.createdAt,
    credentialId: row.credentialId,
    id: row.id as string,
    isActive: row.isActive,
    isDeleted: row.isDeleted,
    organizationId: row.organizationId,
    platform: row.platform,
    status: (row.status as string) ?? (cfg.status as string),
    updatedAt: row.updatedAt,
    userId: row.userId,
  } as OutreachCampaignDocument;
}

function normalizeDocs(rows: unknown[]): OutreachCampaignDocument[] {
  return rows.map((r) => normalizeDoc(r as Record<string, unknown>));
}

@Injectable()
export class OutreachCampaignsService {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {}

  private normalizeRateLimits(
    rateLimits?: CampaignRateLimits,
  ): CampaignRateLimits & {
    currentDayCount: number;
    currentHourCount: number;
    maxPerDay: number;
    maxPerHour: number;
  } {
    return {
      currentDayCount: 0,
      currentHourCount: 0,
      maxPerDay: 50,
      maxPerHour: 10,
      ...rateLimits,
    };
  }

  private getMetric(
    campaign: OutreachCampaignDocument,
    key: 'totalReplies' | 'totalSuccessful',
  ): number {
    const value = campaign[key];
    return typeof value === 'number' ? value : 0;
  }

  private async updateCampaignConfig(
    id: string,
    organizationId: string,
    updater: (doc: OutreachCampaignDocument) => Record<string, unknown>,
  ): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await tx.outreachCampaign.findFirst({
          where: scopedWhere(organizationId, { id }),
        });

        if (!row) {
          return false;
        }

        const doc = normalizeDoc(row as unknown as Record<string, unknown>);
        const cfg = parseConfig(
          (row as unknown as Record<string, unknown>).config,
        );
        const updated = await tx.outreachCampaign.updateMany({
          data: {
            config: {
              ...cfg,
              ...updater(doc),
            } as Prisma.InputJsonValue,
            updatedAt: new Date(),
          },
          where: scopedWhere(organizationId, { id }),
        });

        return updated.count === 1;
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private async applyScopedCampaignUpdate(
    id: string,
    organizationId: string,
    brandId: string | undefined,
    data: Prisma.OutreachCampaignUpdateManyMutationInput,
  ): Promise<OutreachCampaignDocument> {
    const updated = await this.prisma.outreachCampaign.updateMany({
      data,
      where: scopedWhere(organizationId, {
        id,
        ...(brandId ? { brandId } : {}),
      }),
    });

    if (updated.count !== 1) {
      throw new NotFoundException('Campaign', id);
    }

    const campaign = await this.findOneById(id, organizationId, brandId);
    if (!campaign) {
      throw new NotFoundException('Campaign', id);
    }

    return campaign;
  }

  private resolvePatchedSchedule(
    existing: OutreachCampaignDocument,
    nextCampaignType: string | undefined,
    schedule: UpdateOutreachCampaignDto['schedule'],
  ): PersistedCampaignSchedule | Record<string, unknown> | null | undefined {
    if (nextCampaignType !== CampaignType.SCHEDULED_BLAST) {
      return schedule === undefined
        ? undefined
        : ((schedule as Record<string, unknown> | null) ?? null);
    }

    if (schedule === undefined) {
      if (!readCampaignScheduleDueAt(existing.schedule)) {
        throw toOutreachScheduleException('missing_schedule');
      }
      return undefined;
    }

    const dueTime = requireScheduledBlastSchedule(schedule);
    const existingDueAt = readCampaignScheduleDueAt(existing.schedule);
    const version = existingDueAt
      ? readCampaignScheduleVersion(existing.schedule) + 1
      : readCampaignScheduleVersion(existing.schedule);

    return persistScheduledBlastSchedule(dueTime, version);
  }

  private async applyOpenTargetSchedule(
    campaignId: string,
    organizationId: string,
    schedule: { scheduledAt: Date; scheduleVersion: number },
  ): Promise<void> {
    await this.prisma.campaignTarget.updateMany({
      data: {
        scheduledAt: schedule.scheduledAt,
        scheduleVersion: schedule.scheduleVersion,
        status: CampaignTargetStatus.SCHEDULED,
      },
      where: scopedWhere(organizationId, {
        campaignId,
        campaign: {
          isDeleted: false,
          organizationId,
        },
        status: {
          in: [CampaignTargetStatus.PENDING, CampaignTargetStatus.SCHEDULED],
        },
      }),
    });
  }

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  private async assertBrandAccess(
    brandId: string | undefined,
    organizationId: string,
  ): Promise<string | undefined> {
    if (!brandId) return undefined;

    const brand = await findOrThrow(
      this.prisma.brand,
      {
        where: scopedWhere(organizationId, { id: brandId }),
      },
      'Brand',
    );

    return brand.id;
  }

  private async assertCredentialAccess(
    credentialId: string,
    organizationId: string,
    brandId: string | undefined,
    platform: string,
  ): Promise<void> {
    const credentialPlatform = toPrismaCredentialPlatform(platform);
    if (!credentialPlatform) {
      throw new BadRequestException(
        `Unsupported credential platform: ${platform}`,
      );
    }

    await findOrThrow(
      this.prisma.credential,
      {
        where: scopedWhere(organizationId, {
          id: credentialId,
          isConnected: true,
          platform: credentialPlatform,
          ...(brandId ? { brandId } : {}),
        }),
      },
      'Credential',
    );
  }

  async createScoped(
    createDto: CreateOutreachCampaignDto,
    scope: {
      brandId?: string;
      organizationId?: string;
      userId?: string;
    },
  ): Promise<OutreachCampaignDocument> {
    if (!scope.organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    return this.createInternal({
      ...createDto,
      brandId: scope.brandId,
      organizationId: scope.organizationId,
      userId: scope.userId,
    });
  }

  private async createInternal(
    createDto: CreateOutreachCampaignDto & {
      brandId?: string;
      credentialId: string;
      organizationId: string;
      userId?: string;
    },
  ): Promise<OutreachCampaignDocument> {
    const rateLimits = this.normalizeRateLimits(
      createDto.rateLimits as CampaignRateLimits | undefined,
    );

    // Map DTO fields into the `config` JSON column.
    // Scalar columns: organizationId, brandId, credentialId, userId, status.
    const {
      organizationId,
      brandId: requestedBrandId,
      userId,
      credentialId,
      label,
      description,
      platform,
      campaignType,
      discoveryConfig,
      aiConfig,
      dmConfig,
      schedule,
      isActive,
      ...rest
    } = createDto;

    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    requireExecutableOutreachPair({ campaignType, platform });

    const persistedSchedule =
      campaignType === CampaignType.SCHEDULED_BLAST
        ? persistScheduledBlastSchedule(
            requireScheduledBlastSchedule(schedule),
            DEFAULT_CAMPAIGN_SCHEDULE_VERSION,
          )
        : (schedule ?? null);

    const brandId = await this.assertBrandAccess(
      requestedBrandId,
      organizationId,
    );
    await this.assertCredentialAccess(
      credentialId,
      organizationId,
      brandId,
      platform,
    );

    const config: Record<string, unknown> = {
      ...rest,
      aiConfig: aiConfig ?? null,
      description: description ?? null,
      discoveryConfig: discoveryConfig ?? null,
      dmConfig: dmConfig ?? null,
      label: label ?? null,
      rateLimits,
      schedule: persistedSchedule,
      totalReplies: 0,
      totalSuccessful: 0,
    };

    const row = await this.prisma.outreachCampaign.create({
      data: {
        ...(brandId ? { brandId } : {}),
        credentialId,
        campaignType,
        isActive: isActive ?? true,
        organizationId,
        platform,
        ...(userId ? { userId } : {}),
        config: config as Prisma.InputJsonValue,
        status: CampaignStatus.DRAFT,
      },
    });

    return normalizeDoc(row as unknown as Record<string, unknown>);
  }

  async patch(
    id: string,
    updateDto: UpdateOutreachCampaignDto,
    organizationId: string,
    brandId?: string,
  ): Promise<OutreachCampaignDocument> {
    const existing = await this.findOneById(id, organizationId, brandId);

    if (!existing) {
      throw new NotFoundException('Campaign', id);
    }

    const existingConfig = parseConfig(existing.config);
    const {
      campaignType,
      credentialId: requestedCredentialId,
      isActive,
      platform,
      schedule,
      status,
      ...configUpdates
    } = updateDto;

    const nextPlatform = platform ?? existing.platform;
    const nextCampaignType = campaignType ?? existing.campaignType;
    const isCapabilityChange =
      (platform !== undefined && platform !== existing.platform) ||
      (campaignType !== undefined && campaignType !== existing.campaignType);

    if (platform !== undefined || campaignType !== undefined) {
      requireExecutableOutreachPair({
        campaignType: nextCampaignType,
        platform: nextPlatform,
      });

      if (isCapabilityChange && existing.status === CampaignStatus.ACTIVE) {
        requireInactiveOutreachCapabilityChange();
      }
    }

    const credentialId =
      typeof requestedCredentialId === 'string'
        ? requestedCredentialId
        : existing.credentialId;
    if (credentialId) {
      await this.assertCredentialAccess(
        credentialId,
        organizationId,
        existing.brandId ?? brandId,
        String(platform ?? existing.platform ?? ''),
      );
    }

    const nextSchedule = this.resolvePatchedSchedule(
      existing,
      nextCampaignType,
      schedule,
    );
    const updatedConfig = {
      ...existingConfig,
      ...configUpdates,
      ...(nextSchedule !== undefined ? { schedule: nextSchedule } : {}),
    };

    const updated = await this.applyScopedCampaignUpdate(
      id,
      organizationId,
      brandId,
      {
        ...(campaignType !== undefined ? { campaignType } : {}),
        ...(credentialId !== undefined ? { credentialId } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(platform !== undefined ? { platform } : {}),
        ...(status ? { status } : {}),
        config: updatedConfig as Prisma.InputJsonValue,
      },
    );

    if (
      nextSchedule &&
      typeof nextSchedule === 'object' &&
      typeof nextSchedule.dueAt === 'string' &&
      typeof nextSchedule.version === 'number'
    ) {
      await this.applyOpenTargetSchedule(id, organizationId, {
        scheduledAt: new Date(nextSchedule.dueAt),
        scheduleVersion: nextSchedule.version,
      });
    }

    return updated;
  }

  // -------------------------------------------------------------------------
  // Finders
  // -------------------------------------------------------------------------

  /**
   * Find campaign by ID and organization
   */
  async findOneById(
    id: string,
    organizationId: string,
    brandId?: string,
  ): Promise<OutreachCampaignDocument | null> {
    const row = await this.prisma.outreachCampaign.findFirst({
      where: scopedWhere(organizationId, {
        ...(brandId ? { brandId } : {}),
        id,
      }),
    });

    if (!row) return null;
    return normalizeDoc(row as unknown as Record<string, unknown>);
  }

  /**
   * Find all campaigns by organization
   */
  async findByOrganization(
    organizationId: string,
  ): Promise<OutreachCampaignDocument[]> {
    const rows = await this.prisma.outreachCampaign.findMany({
      where: scopedWhere(organizationId, {}),
    });
    return normalizeDocs(rows);
  }

  /**
   * Find all active campaigns
   */
  async findActive(
    organizationId: string,
  ): Promise<OutreachCampaignDocument[]> {
    const rows = await this.prisma.outreachCampaign.findMany({
      where: scopedWhere(organizationId, { status: CampaignStatus.ACTIVE }),
    });
    return normalizeDocs(rows);
  }

  /**
   * Find campaigns by status
   */
  async findByStatus(
    organizationId: string,
    status: CampaignStatus,
  ): Promise<OutreachCampaignDocument[]> {
    const rows = await this.prisma.outreachCampaign.findMany({
      where: scopedWhere(organizationId, { status }),
    });
    return normalizeDocs(rows);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start a campaign
   */
  async start(
    id: string,
    organizationId: string,
    brandId?: string,
  ): Promise<OutreachCampaignDocument> {
    const campaign = await this.findOneById(id, organizationId, brandId);

    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    requireExecutableOutreachPair({
      campaignType: campaign.campaignType,
      platform: campaign.platform,
    });

    if (campaign.campaignType === CampaignType.SCHEDULED_BLAST) {
      const dueAt = readCampaignScheduleDueAt(campaign.schedule);
      if (!dueAt) {
        throw toOutreachScheduleException('missing_schedule');
      }

      await this.applyOpenTargetSchedule(id, organizationId, {
        scheduledAt: dueAt,
        scheduleVersion: readCampaignScheduleVersion(campaign.schedule),
      });
    }

    if (campaign.status === CampaignStatus.ACTIVE) {
      return campaign;
    }

    const cfg = parseConfig(campaign.config);

    return this.applyScopedCampaignUpdate(id, organizationId, brandId, {
      config: {
        ...cfg,
        startedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
      status: CampaignStatus.ACTIVE,
    });
  }

  /**
   * Pause a campaign
   */
  async pause(
    id: string,
    organizationId: string,
    brandId?: string,
  ): Promise<OutreachCampaignDocument> {
    const campaign = await this.findOneById(id, organizationId, brandId);

    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    if (campaign.status !== CampaignStatus.ACTIVE) {
      return campaign;
    }

    return this.applyScopedCampaignUpdate(id, organizationId, brandId, {
      status: CampaignStatus.PAUSED,
    });
  }

  /**
   * Complete a campaign
   */
  async complete(
    id: string,
    organizationId: string,
    brandId?: string,
  ): Promise<OutreachCampaignDocument> {
    const campaign = await this.findOneById(id, organizationId, brandId);

    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    const cfg = parseConfig(campaign.config);

    return this.applyScopedCampaignUpdate(id, organizationId, brandId, {
      config: {
        ...cfg,
        completedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
      status: CampaignStatus.COMPLETED,
    });
  }

  /**
   * Advisory preflight: both windows are normalized, neither counter is written.
   * The provider path must still call `reserveReplySlot` immediately before delivery.
   */
  async canReply(
    id: string,
    organizationId: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    const campaign = await this.findOneById(id, organizationId);

    if (!campaign || campaign.status !== CampaignStatus.ACTIVE) {
      return false;
    }

    return evaluateReplySlotReservation(campaign.rateLimits, now).allowed;
  }

  /**
   * Atomically reserve one reply slot under campaign, organization, active, and
   * non-deleted constraints. This is the final permission to call the provider.
   * Consume-on-reserve: a granted slot is not released if the provider later fails.
   */
  async reserveReplySlot(
    id: string,
    organizationId: string,
    now: Date = new Date(),
  ): Promise<ReplySlotReservationResult> {
    for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt += 1) {
      try {
        const reserved = await this.prisma.$transaction(
          async (tx) => {
            const row = await tx.outreachCampaign.findFirst({
              where: scopedWhere(organizationId, {
                id,
                status: CampaignStatus.ACTIVE,
              }),
            });

            if (!row) {
              return false;
            }

            const doc = normalizeDoc(row as unknown as Record<string, unknown>);
            const decision = evaluateReplySlotReservation(doc.rateLimits, now);

            if (!decision.allowed) {
              return false;
            }

            const cfg = parseConfig(
              (row as unknown as Record<string, unknown>).config,
            );
            const updated = await tx.outreachCampaign.updateMany({
              data: {
                config: {
                  ...cfg,
                  rateLimits: mergeReservedRateLimits(
                    doc.rateLimits,
                    decision.next,
                  ),
                } as Prisma.InputJsonValue,
                updatedAt: now,
              },
              where: scopedWhere(organizationId, {
                id,
                status: CampaignStatus.ACTIVE,
              }),
            });

            return updated.count === 1;
          },
          { isolationLevel: 'Serializable' },
        );

        this.logger.log('OutreachCampaignsService reserveReplySlot', {
          attempt: attempt + 1,
          campaignId: id,
          reserved,
        });

        return { reserved };
      } catch (error: unknown) {
        const isRetryable =
          isPrismaSerializationFailure(error) &&
          attempt < MAX_SERIALIZATION_RETRIES - 1;

        if (!isRetryable) {
          if (isPrismaSerializationFailure(error)) {
            this.logger.warn(
              'OutreachCampaignsService reserveReplySlot failed closed',
              { attempt: attempt + 1, campaignId: id },
            );
            return { reserved: false };
          }
          throw error;
        }

        this.logger.warn('OutreachCampaignsService reserveReplySlot retrying', {
          attempt: attempt + 1,
          campaignId: id,
        });
      }
    }

    return { reserved: false };
  }

  /**
   * Increment delivered-reply totals after a successful provider post.
   * Rate-limit counters are owned by `reserveReplySlot` so a later increment
   * cannot double-count the same attempt or reclaim a consumed slot.
   */
  async incrementReplyCounters(
    id: string,
    organizationId: string,
  ): Promise<boolean> {
    return this.updateCampaignConfig(id, organizationId, (doc) => ({
      totalReplies: (doc.totalReplies ?? 0) + 1,
      totalSuccessful: (doc.totalSuccessful ?? 0) + 1,
    }));
  }

  /**
   * Increment failed counter
   */
  async incrementFailedCounter(
    id: string,
    organizationId: string,
  ): Promise<boolean> {
    return this.updateCampaignConfig(id, organizationId, (doc) => ({
      totalFailed: Number(doc.totalFailed ?? 0) + 1,
    }));
  }

  /**
   * Increment DM sent counter
   */
  async incrementDmCounter(
    id: string,
    organizationId: string,
  ): Promise<boolean> {
    return this.updateCampaignConfig(id, organizationId, (doc) => {
      const rateLimits = this.normalizeRateLimits(doc.rateLimits);
      const now = new Date();
      const nextHour = new Date(now.getTime() + 3600 * 1000);
      const nextDay = new Date(now.getTime() + 86400 * 1000);

      return {
        rateLimits: {
          ...rateLimits,
          currentDayCount: rateLimits.currentDayCount + 1,
          currentHourCount: rateLimits.currentHourCount + 1,
          dayResetAt: rateLimits.dayResetAt ?? nextDay,
          hourResetAt: rateLimits.hourResetAt ?? nextHour,
        },
      };
    });
  }

  /**
   * Increment skipped counter — does not count toward rate limits.
   */
  async incrementSkippedCounter(
    id: string,
    organizationId: string,
  ): Promise<boolean> {
    return this.updateCampaignConfig(id, organizationId, (doc) => ({
      totalSkipped: ((doc.totalSkipped as number) ?? 0) + 1,
    }));
  }

  /**
   * Increment total targets count
   */
  async incrementTargetsCount(
    id: string,
    organizationId: string,
    _count: number = 1,
  ): Promise<boolean> {
    return this.updateCampaignConfig(id, organizationId, (doc) => ({
      totalTargets: ((doc.totalTargets as number) ?? 0) + _count,
    }));
  }

  /**
   * Get campaign analytics
   */
  async getAnalytics(
    id: string,
    organizationId: string,
    brandId?: string,
  ): Promise<{
    campaign: OutreachCampaignDocument;
    successRate: number;
    repliesPerHour: number;
  }> {
    const campaign = await this.findOneById(id, organizationId, brandId);

    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    const totalReplies = this.getMetric(campaign, 'totalReplies');
    const totalSuccessful = this.getMetric(campaign, 'totalSuccessful');
    const successRate =
      totalReplies > 0 ? (totalSuccessful / totalReplies) * 100 : 0;

    const duration = campaign.startedAt
      ? (Date.now() - new Date(campaign.startedAt).getTime()) / 3600000
      : 0;

    const repliesPerHour = duration > 0 ? totalSuccessful / duration : 0;

    return {
      campaign,
      repliesPerHour: Math.round(repliesPerHour * 100) / 100,
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  /**
   * System-only inventory of active, non-deleted campaigns for one tenant.
   * Generic unscoped `find` is blocked so dispatch cannot widen past the job org.
   */
  async findActiveForDispatch(
    organizationId: string,
    now: Date = new Date(),
  ): Promise<OutreachCampaignDocument[]> {
    const campaigns = await this.findActive(organizationId);
    return campaigns.filter((campaign) =>
      isScheduledBlastDueForDispatch(campaign, now),
    );
  }

  /**
   * @deprecated Use `findActiveForDispatch` or a scoped campaign finder.
   */
  async find(
    _query: Record<string, unknown>,
  ): Promise<OutreachCampaignDocument[]> {
    throw new BadRequestException(SCOPED_FIND_ERROR);
  }

  async findOne(
    query: Record<string, unknown>,
  ): Promise<OutreachCampaignDocument | null> {
    const organizationId = this.requireOrganizationId(query.organizationId);
    const row = await this.prisma.outreachCampaign.findFirst({
      where: scopedWhere(organizationId, this.toOptionalCampaignFilters(query)),
    });
    return row ? normalizeDoc(row as unknown as Record<string, unknown>) : null;
  }

  async findAll(
    query: PrismaFindAllInput,
    options: {
      limit?: number;
      page?: number;
      pagination?: boolean;
    } = {},
  ): Promise<{
    docs: OutreachCampaignDocument[];
    hasNextPage: boolean;
    hasPrevPage: boolean;
    limit: number;
    page: number;
    totalDocs: number;
    totalPages: number;
  }> {
    const input = query.where ?? {};
    const organizationId = this.requireOrganizationId(input.organizationId);
    const filters = this.toOptionalCampaignFilters(input);
    const limit = options.limit ?? 10;
    const page = options.page ?? 1;
    const skip = options.pagination === false ? undefined : (page - 1) * limit;
    const take = options.pagination === false ? undefined : limit;

    const [rows, totalDocs] = await Promise.all([
      this.prisma.outreachCampaign.findMany({
        orderBy:
          query.orderBy as Prisma.OutreachCampaignOrderByWithRelationInput,
        skip,
        take,
        where: scopedWhere(organizationId, filters),
      }),
      this.prisma.outreachCampaign.count({
        where: scopedWhere(organizationId, filters),
      }),
    ]);

    const totalPages = limit > 0 ? Math.ceil(totalDocs / limit) : 1;

    return {
      docs: normalizeDocs(rows),
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      limit,
      page,
      totalDocs,
      totalPages,
    };
  }

  async remove(
    id: string,
    organizationId: string,
    brandId?: string,
  ): Promise<OutreachCampaignDocument | null> {
    const existing = await this.findOneById(id, organizationId, brandId);

    if (!existing) {
      return null;
    }

    const updated = await this.prisma.outreachCampaign.updateMany({
      data: { isDeleted: true },
      where: scopedWhere(organizationId, {
        id: existing.id,
        ...(brandId ? { brandId } : {}),
      }),
    });

    if (updated.count !== 1) {
      return null;
    }

    const row = await this.prisma.outreachCampaign.findFirst({
      where: scopedWhere(organizationId, {
        id: existing.id,
        isDeleted: true,
        ...(brandId ? { brandId } : {}),
      }),
    });

    return row ? normalizeDoc(row as unknown as Record<string, unknown>) : null;
  }

  private requireOrganizationId(value: unknown): string {
    if (typeof value !== 'string' || !value) {
      throw new BadRequestException('Organization context is required');
    }

    return value;
  }

  private toOptionalCampaignFilters(
    query: Record<string, unknown>,
  ): Prisma.OutreachCampaignWhereInput {
    return {
      ...(typeof query.id === 'string' ? { id: query.id } : {}),
      ...(typeof query.brandId === 'string' ? { brandId: query.brandId } : {}),
      ...(query.status !== undefined ? { status: query.status as string } : {}),
    };
  }
}
