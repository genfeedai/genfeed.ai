import { CreateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/create-outreach-campaign.dto';
import { UpdateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/update-outreach-campaign.dto';
import {
  OutreachCampaign,
  type OutreachCampaignDocument,
} from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import type { PopulateOption } from '@genfeedai/interfaces';
import { CampaignStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
// @ts-expect-error - base class type mismatch
export class OutreachCampaignsService extends BaseService<
  OutreachCampaignDocument,
  CreateOutreachCampaignDto,
  UpdateOutreachCampaignDto
> {
  constructor(
    @InjectModel(OutreachCampaign.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<OutreachCampaignDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
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
      ...(brandId ? { brand: new Types.ObjectId(brandId) } : {}),
      _id: new Types.ObjectId(id),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
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
      organization: new Types.ObjectId(organizationId),
    });
  }

  /**
   * Find all active campaigns
   */
  findActive(organizationId: string): Promise<OutreachCampaignDocument[]> {
    return this.find({
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
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
      organization: new Types.ObjectId(organizationId),
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
      _id: new Types.ObjectId(id),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
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
    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $inc: {
          'rateLimits.currentDayCount': 1,
          'rateLimits.currentHourCount': 1,
          totalReplies: 1,
          totalSuccessful: 1,
        },
        $set: { lastActivityAt: new Date() },
      },
    );
  }

  /**
   * Increment failed counter
   */
  async incrementFailedCounter(id: string): Promise<void> {
    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $inc: { totalFailed: 1 },
        $set: { lastActivityAt: new Date() },
      },
    );
  }

  /**
   * Increment DM sent counter
   */
  async incrementDmCounter(id: string): Promise<void> {
    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $inc: {
          'rateLimits.currentDayCount': 1,
          'rateLimits.currentHourCount': 1,
          totalDmsSent: 1,
          totalSuccessful: 1,
        },
        $set: { lastActivityAt: new Date() },
      },
    );
  }

  /**
   * Increment skipped counter
   */
  async incrementSkippedCounter(id: string): Promise<void> {
    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $inc: { totalSkipped: 1 },
      },
    );
  }

  /**
   * Increment total targets count
   */
  async incrementTargetsCount(id: string, count: number = 1): Promise<void> {
    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $inc: { totalTargets: count },
      },
    );
  }

  /**
   * Reset hourly rate limit counter
   */
  private async resetHourlyCounter(id: string): Promise<void> {
    const hourResetAt = new Date();
    hourResetAt.setHours(hourResetAt.getHours() + 1);

    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $set: {
          'rateLimits.currentHourCount': 0,
          'rateLimits.hourResetAt': hourResetAt,
        },
      },
    );
  }

  /**
   * Reset daily rate limit counter
   */
  private async resetDailyCounter(id: string): Promise<void> {
    const dayResetAt = new Date();
    dayResetAt.setDate(dayResetAt.getDate() + 1);
    dayResetAt.setHours(0, 0, 0, 0);

    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $set: {
          'rateLimits.currentDayCount': 0,
          'rateLimits.dayResetAt': dayResetAt,
        },
      },
    );
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
  private find(
    query: Record<string, unknown>,
  ): Promise<OutreachCampaignDocument[]> {
    return this.model.find(query).exec();
  }
}
