import { CreateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/create-outreach-campaign.dto';
import { UpdateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/update-outreach-campaign.dto';
import type {
  CampaignRateLimits,
  OutreachCampaignDocument,
} from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CampaignStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

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

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  async create(
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
        ...(brand ? { brandId: brand as string } : {}),
        ...(organization ? { organizationId: organization as string } : {}),
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
    const existing = await this.prisma.outreachCampaign.findFirst({
      where: { id, isDeleted: false },
    });

    if (!existing) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

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
   * Increment reply counters after a successful reply
   */
  async incrementReplyCounters(id: string): Promise<void> {
    const row = await this.prisma.outreachCampaign.findFirst({
      where: { id },
    });
    if (!row) return;
    const cfg = parseConfig((row as unknown as Record<string, unknown>).config);
    await this.prisma.outreachCampaign.update({
      data: {
        config: {
          ...cfg,
          totalReplies: ((cfg.totalReplies as number) ?? 0) + 1,
          totalSuccessful: ((cfg.totalSuccessful as number) ?? 0) + 1,
        } as never,
        updatedAt: new Date(),
      } as never,
      where: { id },
    });
  }

  /**
   * Increment failed counter
   */
  async incrementFailedCounter(id: string): Promise<void> {
    const row = await this.prisma.outreachCampaign.findFirst({
      where: { id },
    });
    if (!row) return;
    const cfg = parseConfig((row as unknown as Record<string, unknown>).config);
    await this.prisma.outreachCampaign.update({
      data: {
        config: {
          ...cfg,
          totalFailed: ((cfg.totalFailed as number) ?? 0) + 1,
        } as never,
        updatedAt: new Date(),
      } as never,
      where: { id },
    });
  }

  /**
   * Increment DM sent counter
   */
  async incrementDmCounter(id: string): Promise<void> {
    const row = await this.prisma.outreachCampaign.findFirst({
      where: { id },
    });
    if (!row) return;
    const cfg = parseConfig((row as unknown as Record<string, unknown>).config);
    await this.prisma.outreachCampaign.update({
      data: {
        config: {
          ...cfg,
          totalDmsSent: ((cfg.totalDmsSent as number) ?? 0) + 1,
        } as never,
        updatedAt: new Date(),
      } as never,
      where: { id },
    });
  }

  /**
   * Increment skipped counter
   */
  async incrementSkippedCounter(id: string): Promise<void> {
    const row = await this.prisma.outreachCampaign.findFirst({
      where: { id },
    });
    if (!row) return;
    const cfg = parseConfig((row as unknown as Record<string, unknown>).config);
    await this.prisma.outreachCampaign.update({
      data: {
        config: {
          ...cfg,
          totalSkipped: ((cfg.totalSkipped as number) ?? 0) + 1,
        } as never,
        updatedAt: new Date(),
      } as never,
      where: { id },
    });
  }

  /**
   * Increment total targets count
   */
  async incrementTargetsCount(id: string, _count: number = 1): Promise<void> {
    const row = await this.prisma.outreachCampaign.findFirst({
      where: { id },
    });
    if (!row) return;
    const cfg = parseConfig((row as unknown as Record<string, unknown>).config);
    await this.prisma.outreachCampaign.update({
      data: {
        config: {
          ...cfg,
          totalTargets: ((cfg.totalTargets as number) ?? 0) + _count,
        } as never,
        updatedAt: new Date(),
      } as never,
      where: { id },
    });
  }

  /**
   * Reset hourly rate limit counter
   */
  private async resetHourlyCounter(id: string): Promise<void> {
    const row = await this.prisma.outreachCampaign.findFirst({
      where: { id },
    });
    if (!row) return;
    const cfg = parseConfig((row as unknown as Record<string, unknown>).config);
    const rateLimits = this.normalizeRateLimits(
      cfg.rateLimits as CampaignRateLimits | undefined,
    );
    const hourResetAt = new Date();
    hourResetAt.setHours(hourResetAt.getHours() + 1);
    await this.prisma.outreachCampaign.update({
      data: {
        config: {
          ...cfg,
          rateLimits: { ...rateLimits, currentHourCount: 0, hourResetAt },
        } as never,
        updatedAt: new Date(),
      } as never,
      where: { id },
    });
  }

  /**
   * Reset daily rate limit counter
   */
  private async resetDailyCounter(id: string): Promise<void> {
    const row = await this.prisma.outreachCampaign.findFirst({
      where: { id },
    });
    if (!row) return;
    const cfg = parseConfig((row as unknown as Record<string, unknown>).config);
    const rateLimits = this.normalizeRateLimits(
      cfg.rateLimits as CampaignRateLimits | undefined,
    );
    const dayResetAt = new Date();
    dayResetAt.setDate(dayResetAt.getDate() + 1);
    dayResetAt.setHours(0, 0, 0, 0);
    await this.prisma.outreachCampaign.update({
      data: {
        config: {
          ...cfg,
          rateLimits: { ...rateLimits, currentDayCount: 0, dayResetAt },
        } as never,
        updatedAt: new Date(),
      } as never,
      where: { id },
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
}
