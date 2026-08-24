import { CreateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/create-outreach-campaign.dto';
import { UpdateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/update-outreach-campaign.dto';
import type {
  CampaignRateLimits,
  OutreachCampaignDocument,
} from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import {
  evaluateReplySlotReservation,
  mergeReservedRateLimits,
} from '@api/collections/outreach-campaigns/services/outreach-reply-slot.util';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { PrismaFindAllInput } from '@api/shared/services/base/base.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { CampaignStatus, toPrismaCredentialPlatform } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

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
    updater: (doc: OutreachCampaignDocument) => Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const row = await tx.outreachCampaign.findFirst({
          where: { id, isDeleted: false },
        });

        if (!row) return;

        const doc = normalizeDoc(row as unknown as Record<string, unknown>);
        const cfg = parseConfig(
          (row as unknown as Record<string, unknown>).config,
        );

        await tx.outreachCampaign.update({
          data: {
            config: {
              ...cfg,
              ...updater(doc),
            } as Prisma.InputJsonValue,
            updatedAt: new Date(),
          },
          where: { id },
        });
      },
      { isolationLevel: 'Serializable' },
    );
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
      schedule: schedule ?? null,
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
  ): Promise<OutreachCampaignDocument> {
    const existing = await findOrThrow(
      this.prisma.outreachCampaign,
      { where: { id, isDeleted: false } },
      'Campaign',
      id,
    );

    const existingConfig = parseConfig(
      (existing as unknown as Record<string, unknown>).config,
    );
    const existingRecord = existing as unknown as Record<string, unknown>;

    const {
      campaignType,
      credentialId: requestedCredentialId,
      isActive,
      platform,
      status,
      ...configUpdates
    } = updateDto;

    const organizationId = String(existingRecord.organizationId);
    const brandId = existingRecord.brandId as string | null | undefined;
    const credentialId =
      typeof requestedCredentialId === 'string'
        ? requestedCredentialId
        : (existingRecord.credentialId as string | null | undefined);
    if (credentialId) {
      await this.assertCredentialAccess(
        credentialId,
        organizationId,
        brandId ?? undefined,
        String(platform ?? existingRecord.platform ?? ''),
      );
    }

    const updatedConfig = { ...existingConfig, ...configUpdates };

    const row = await this.prisma.outreachCampaign.update({
      data: {
        ...(campaignType !== undefined ? { campaignType } : {}),
        ...(credentialId !== undefined ? { credentialId } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(platform !== undefined ? { platform } : {}),
        ...(status ? { status } : {}),
        config: updatedConfig as Prisma.InputJsonValue,
      },
      where: { id },
    });

    return normalizeDoc(row as unknown as Record<string, unknown>);
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

    if (campaign.status === CampaignStatus.ACTIVE) {
      return campaign;
    }

    // Store startedAt inside config; update status as a scalar column.
    const existingRow = await this.prisma.outreachCampaign.findFirst({
      where: { id },
    });
    const cfg = parseConfig(
      (existingRow as unknown as Record<string, unknown>)?.config,
    );

    const row = await this.prisma.outreachCampaign.update({
      data: {
        config: {
          ...cfg,
          startedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
        status: CampaignStatus.ACTIVE,
      },
      where: { id },
    });

    return normalizeDoc(row as unknown as Record<string, unknown>);
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

    const row = await this.prisma.outreachCampaign.update({
      data: { status: CampaignStatus.PAUSED },
      where: { id },
    });

    return normalizeDoc(row as unknown as Record<string, unknown>);
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

    const existingRow = await this.prisma.outreachCampaign.findFirst({
      where: { id },
    });
    const cfg = parseConfig(
      (existingRow as unknown as Record<string, unknown>)?.config,
    );

    const row = await this.prisma.outreachCampaign.update({
      data: {
        config: {
          ...cfg,
          completedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
        status: CampaignStatus.COMPLETED,
      },
      where: { id },
    });

    return normalizeDoc(row as unknown as Record<string, unknown>);
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
  async incrementReplyCounters(id: string): Promise<void> {
    await this.updateCampaignConfig(id, (doc) => ({
      totalReplies: (doc.totalReplies ?? 0) + 1,
      totalSuccessful: (doc.totalSuccessful ?? 0) + 1,
    }));
  }

  /**
   * Increment failed counter
   */
  async incrementFailedCounter(id: string): Promise<void> {
    await this.updateCampaignConfig(id, (doc) => ({
      totalFailed: Number(doc.totalFailed ?? 0) + 1,
    }));
  }

  /**
   * Increment DM sent counter
   */
  async incrementDmCounter(id: string): Promise<void> {
    await this.updateCampaignConfig(id, (doc) => {
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
  async incrementSkippedCounter(id: string): Promise<void> {
    await this.updateCampaignConfig(id, (doc) => ({
      totalSkipped: ((doc.totalSkipped as number) ?? 0) + 1,
    }));
  }

  /**
   * Increment total targets count
   */
  async incrementTargetsCount(id: string, _count: number = 1): Promise<void> {
    await this.updateCampaignConfig(id, (doc) => ({
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
   * Find documents by Prisma-compatible where clause.
   * Only accepts `organizationId`, `status`, `isDeleted` as valid top-level filters.
   */
  async find(
    query: Record<string, unknown>,
  ): Promise<OutreachCampaignDocument[]> {
    const where: Record<string, unknown> = {};
    if (query.organizationId !== undefined) {
      where.organizationId = query.organizationId;
    }
    if (query.status !== undefined) where.status = query.status;
    if (query.isDeleted !== undefined) where.isDeleted = query.isDeleted;
    if (query.brandId !== undefined) where.brandId = query.brandId;

    const rows = await this.prisma.outreachCampaign.findMany({
      where,
    });
    return normalizeDocs(rows);
  }

  async findOne(
    query: Record<string, unknown>,
  ): Promise<OutreachCampaignDocument | null> {
    const where = this.toPrismaWhere(query);
    const row = await this.prisma.outreachCampaign.findFirst({ where });
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
    const where = this.toPrismaWhere(query.where ?? {});
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
        where,
      }),
      this.prisma.outreachCampaign.count({ where }),
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

  async remove(id: string): Promise<OutreachCampaignDocument | null> {
    const existing = await this.findOne({ id: id });

    if (!existing) {
      return null;
    }

    const row = await this.prisma.outreachCampaign.update({
      data: { isDeleted: true },
      where: { id: existing.id },
    });

    return normalizeDoc(row as unknown as Record<string, unknown>);
  }

  private toPrismaWhere(
    query: Record<string, unknown>,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    const id = query.id;

    if (typeof id === 'string') {
      where.id = id;
    }

    if (query.organizationId !== undefined) {
      where.organizationId = query.organizationId;
    }

    if (query.brandId !== undefined) {
      where.brandId = query.brandId;
    }

    if (query.status !== undefined) where.status = query.status;
    if (query.isDeleted !== undefined) where.isDeleted = query.isDeleted;

    return where;
  }
}
