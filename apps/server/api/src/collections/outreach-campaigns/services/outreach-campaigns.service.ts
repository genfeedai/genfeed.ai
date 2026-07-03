import { CreateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/create-outreach-campaign.dto';
import { UpdateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/update-outreach-campaign.dto';
import type {
  CampaignRateLimits,
  OutreachCampaignDocument,
} from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { PrismaFindAllInput } from '@api/shared/services/base/base.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { CampaignStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

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
// The Prisma model has scalar columns (id, organizationId, brandId, userId,
// status, config, isDeleted, createdAt, updatedAt).  All domain fields live
// inside `config`.
// ---------------------------------------------------------------------------
function normalizeDoc(row: Record<string, unknown>): OutreachCampaignDocument {
  const cfg = parseConfig(row.config);
  return {
    ...cfg,
    _id: (row.mongoId as string) || (row.id as string),
    brandId: row.brandId,
    createdAt: row.createdAt,
    id: row.id as string,
    isDeleted: row.isDeleted,
    mongoId: row.mongoId,
    // expose organizationId as `organization` for legacy consumers
    organization:
      (row.organizationId as string) ?? (cfg.organization as string),
    organizationId: row.organizationId,
    status: (row.status as string) ?? (cfg.status as string),
    updatedAt: row.updatedAt,
    userId: row.userId,
  } as OutreachCampaignDocument;
}

function normalizeDocs(rows: unknown[]): OutreachCampaignDocument[] {
  return rows.map((r) => normalizeDoc(r as Record<string, unknown>));
}

function toPrismaCredentialPlatform(platform: string): string {
  return platform.toUpperCase();
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
            } as never,
            updatedAt: new Date(),
          } as never,
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
        where: {
          OR: [{ id: brandId }, { mongoId: brandId }],
          isDeleted: false,
          organizationId,
        },
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
    await findOrThrow(
      this.prisma.credential,
      {
        where: {
          OR: [{ id: credentialId }, { mongoId: credentialId }],
          isConnected: true,
          isDeleted: false,
          organizationId,
          platform: toPrismaCredentialPlatform(platform) as never,
          ...(brandId ? { brandId } : {}),
        },
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
      brand: scope.brandId,
      organization: scope.organizationId,
      user: scope.userId,
    });
  }

  private async createInternal(
    createDto: CreateOutreachCampaignDto,
  ): Promise<OutreachCampaignDocument> {
    const rateLimits = this.normalizeRateLimits(
      createDto.rateLimits as CampaignRateLimits | undefined,
    );

    // Map DTO fields into the `config` JSON column.
    // Scalar columns: organizationId, brandId, userId, status.
    const {
      organization,
      brand,
      user,
      credential,
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
    } = createDto as CreateOutreachCampaignDto & Record<string, unknown>;

    if (!organization || typeof organization !== 'string') {
      throw new BadRequestException('Organization context is required');
    }

    const brandId = await this.assertBrandAccess(
      typeof brand === 'string' ? brand : undefined,
      organization,
    );
    await this.assertCredentialAccess(
      credential,
      organization,
      brandId,
      platform,
    );

    const config: Record<string, unknown> = {
      ...rest,
      aiConfig: aiConfig ?? null,
      campaignType: campaignType ?? null,
      credential: credential ?? null,
      description: description ?? null,
      discoveryConfig: discoveryConfig ?? null,
      dmConfig: dmConfig ?? null,
      isActive: isActive ?? true,
      label: label ?? null,
      platform: platform ?? null,
      rateLimits,
      schedule: schedule ?? null,
      totalReplies: 0,
      totalSuccessful: 0,
    };

    const row = await this.prisma.outreachCampaign.create({
      data: {
        ...(brandId ? { brandId } : {}),
        organizationId: organization,
        ...(user ? { userId: user as string } : {}),
        config: config as never,
        status: CampaignStatus.DRAFT,
      } as never,
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

    // Separate scalar updates from config updates
    const { status, ...configUpdates } =
      updateDto as UpdateOutreachCampaignDto & Record<string, unknown>;

    const updatedConfig = { ...existingConfig, ...configUpdates };

    const row = await this.prisma.outreachCampaign.update({
      data: {
        ...(status ? { status } : {}),
        config: updatedConfig as never,
      } as never,
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
      where: {
        ...(brandId ? { brandId } : {}),
        id,
        isDeleted: false,
        organizationId,
      },
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
      where: { isDeleted: false, organizationId },
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
      where: {
        isDeleted: false,
        organizationId,
        status: CampaignStatus.ACTIVE,
      },
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
      where: { isDeleted: false, organizationId, status },
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
        config: { ...cfg, startedAt: new Date().toISOString() } as never,
        status: CampaignStatus.ACTIVE,
      } as never,
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
      data: { status: CampaignStatus.PAUSED } as never,
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
        config: { ...cfg, completedAt: new Date().toISOString() } as never,
        status: CampaignStatus.COMPLETED,
      } as never,
      where: { id },
    });

    return normalizeDoc(row as unknown as Record<string, unknown>);
  }

  /**
   * Check if rate limit allows another reply
   */
  async canReply(id: string, organizationId: string): Promise<boolean> {
    const campaign = await this.findOneById(id, organizationId);

    if (!campaign || campaign.status !== CampaignStatus.ACTIVE) {
      return false;
    }

    const now = new Date();
    const rateLimits = this.normalizeRateLimits(campaign.rateLimits);

    if (!rateLimits.hourResetAt || now >= new Date(rateLimits.hourResetAt)) {
      await this.resetHourlyCounter(id);
      return true;
    }

    if (!rateLimits.dayResetAt || now >= new Date(rateLimits.dayResetAt)) {
      await this.resetDailyCounter(id);
      return true;
    }

    if (rateLimits.currentHourCount >= rateLimits.maxPerHour) {
      return false;
    }

    if (rateLimits.currentDayCount >= rateLimits.maxPerDay) {
      return false;
    }

    return true;
  }

  /**
   * Increment reply counters after a successful reply.
   * Also bumps the hourly and daily rate-limit counters so `canReply` correctly
   * enforces the configured limits.
   */
  async incrementReplyCounters(id: string): Promise<void> {
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
        totalReplies: (doc.totalReplies ?? 0) + 1,
        totalSuccessful: (doc.totalSuccessful ?? 0) + 1,
      };
    });
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
   * Reset hourly rate limit counter and set the next reset window.
   */
  private async resetHourlyCounter(id: string): Promise<void> {
    const now = new Date();
    const nextHour = new Date(now.getTime() + 3600 * 1000);

    await this.updateCampaignConfig(id, (doc) => {
      const rateLimits = this.normalizeRateLimits(doc.rateLimits);

      return {
        rateLimits: {
          ...rateLimits,
          currentHourCount: 0,
          hourResetAt: nextHour,
        },
      };
    });
  }

  /**
   * Reset daily rate limit counter and set the next reset window.
   */
  private async resetDailyCounter(id: string): Promise<void> {
    const now = new Date();
    const nextDay = new Date(now.getTime() + 86400 * 1000);

    await this.updateCampaignConfig(id, (doc) => {
      const rateLimits = this.normalizeRateLimits(doc.rateLimits);

      return {
        rateLimits: {
          ...rateLimits,
          currentDayCount: 0,
          dayResetAt: nextDay,
        },
      };
    });
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
    // Translate legacy `organization` key to the Prisma column name
    const where: Record<string, unknown> = {};
    if (query.organizationId !== undefined) {
      where.organizationId = query.organizationId;
    } else if (query.organization !== undefined) {
      where.organizationId = query.organization;
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
        orderBy: query.orderBy as never,
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
    const existing = await this.findOne({ _id: id, isDeleted: false });

    if (!existing) {
      return null;
    }

    const row = await this.prisma.outreachCampaign.update({
      data: { isDeleted: true } as never,
      where: { id: existing.id },
    });

    return normalizeDoc(row as unknown as Record<string, unknown>);
  }

  private toPrismaWhere(
    query: Record<string, unknown>,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    const id = query.id ?? query._id;

    if (typeof id === 'string') {
      where.OR = [{ id }, { mongoId: id }];
    }

    if (query.organizationId !== undefined) {
      where.organizationId = query.organizationId;
    } else if (query.organization !== undefined) {
      where.organizationId = query.organization;
    }

    if (query.brandId !== undefined) {
      where.brandId = query.brandId;
    } else if (query.brand !== undefined) {
      where.brandId = query.brand;
    }

    if (query.status !== undefined) where.status = query.status;
    if (query.isDeleted !== undefined) where.isDeleted = query.isDeleted;

    return where;
  }
}
