import { CreateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/create-outreach-campaign.dto';
import { UpdateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/update-outreach-campaign.dto';
import type { OutreachCampaignDocument } from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { CampaignStatus } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
// @ts-expect-error - base class type mismatch
export class OutreachCampaignsService extends BaseService<
  OutreachCampaignDocument,
  CreateOutreachCampaignDto,
  UpdateOutreachCampaignDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
  }

  create(
    createDto: CreateOutreachCampaignDto,
    populate: (string | PopulateOption)[] = [
      { path: 'organization' },
      { path: 'brand' },
      { path: 'credential' },
    ],
  ): Promise<OutreachCampaignDocument> {
    const rateLimits = createDto.rateLimits || {
      currentDayCount: 0,
      currentHourCount: 0,
      delayBetweenRepliesSeconds: 60,
      maxPerDay: 50,
      maxPerHour: 10,
    };

    return super.create({ ...createDto, rateLimits }, populate);
  }

  patch(
    id: string,
    updateDto: UpdateOutreachCampaignDto,
    populate: (string | PopulateOption)[] = [
      { path: 'organization' },
      { path: 'brand' },
      { path: 'credential' },
    ],
  ): Promise<OutreachCampaignDocument> {
    return super.patch(id, updateDto, populate);
  }

  /**
   * Find campaign by ID and organization
   */
  findOneById(
    id: string,
    organizationId: string,
    brandId?: string,
  ): Promise<OutreachCampaignDocument | null> {
    return this.findOne({
      ...(brandId ? { brand: brandId } : {}),
      _id: id,
      isDeleted: false,
      organization: organizationId,
    });
  }

  /**
   * Find all campaigns by organization
   */
  findByOrganization(
    organizationId: string,
  ): Promise<OutreachCampaignDocument[]> {
    return this.find({
      isDeleted: false,
      organization: organizationId,
    });
  }

  /**
   * Find all active campaigns
   */
  findActive(organizationId: string): Promise<OutreachCampaignDocument[]> {
    return this.find({
      isDeleted: false,
      organization: organizationId,
      status: CampaignStatus.ACTIVE,
    });
  }

  /**
   * Find campaigns by status
   */
  findByStatus(
    organizationId: string,
    status: CampaignStatus,
  ): Promise<OutreachCampaignDocument[]> {
    return this.find({
      isDeleted: false,
      organization: organizationId,
      status,
    });
  }

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

    return this.patch(id, {
      startedAt: new Date(),
      status: CampaignStatus.ACTIVE,
    } as UpdateOutreachCampaignDto);
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

    return this.patch(id, {
      status: CampaignStatus.PAUSED,
    } as UpdateOutreachCampaignDto);
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

    return this.patch(id, {
      completedAt: new Date(),
      status: CampaignStatus.COMPLETED,
    } as UpdateOutreachCampaignDto);
  }

  /**
   * Check if rate limit allows another reply
   */
  async canReply(id: string, organizationId: string): Promise<boolean> {
    const campaign = await this.findOne({
      _id: id,
      isDeleted: false,
      organization: organizationId,
    });

    if (!campaign || campaign.status !== CampaignStatus.ACTIVE) {
      return false;
    }

    const now = new Date();
    const rateLimits = campaign.rateLimits;

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
    await this.prisma.outreachCampaign.update({
      data: {
        config: {
          update: {
            totalReplies: { increment: 1 },
            totalSuccessful: { increment: 1 },
          },
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
    await this.prisma.outreachCampaign.update({
      data: { updatedAt: new Date() } as never,
      where: { id },
    });
  }

  /**
   * Increment DM sent counter
   */
  async incrementDmCounter(id: string): Promise<void> {
    await this.prisma.outreachCampaign.update({
      data: { updatedAt: new Date() } as never,
      where: { id },
    });
  }

  /**
   * Increment skipped counter
   */
  async incrementSkippedCounter(id: string): Promise<void> {
    await this.prisma.outreachCampaign.update({
      data: { updatedAt: new Date() } as never,
      where: { id },
    });
  }

  /**
   * Increment total targets count
   */
  async incrementTargetsCount(id: string, _count: number = 1): Promise<void> {
    await this.prisma.outreachCampaign.update({
      data: { updatedAt: new Date() } as never,
      where: { id },
    });
  }

  /**
   * Reset hourly rate limit counter
   */
  private async resetHourlyCounter(id: string): Promise<void> {
    await this.prisma.outreachCampaign.update({
      data: { updatedAt: new Date() } as never,
      where: { id },
    });
  }

  /**
   * Reset daily rate limit counter
   */
  private async resetDailyCounter(id: string): Promise<void> {
    await this.prisma.outreachCampaign.update({
      data: { updatedAt: new Date() } as never,
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

    const successRate =
      campaign.totalReplies > 0
        ? (campaign.totalSuccessful / campaign.totalReplies) * 100
        : 0;

    const duration = campaign.startedAt
      ? (Date.now() - campaign.startedAt.getTime()) / 3600000
      : 0;

    const repliesPerHour =
      duration > 0 ? campaign.totalSuccessful / duration : 0;

    return {
      campaign,
      repliesPerHour: Math.round(repliesPerHour * 100) / 100,
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  /**
   * Find documents by query - helper method
   */
  private async find(
    query: Record<string, unknown>,
  ): Promise<OutreachCampaignDocument[]> {
    return this.prisma.outreachCampaign.findMany({
      where: query as never,
    }) as never;
  }
}
