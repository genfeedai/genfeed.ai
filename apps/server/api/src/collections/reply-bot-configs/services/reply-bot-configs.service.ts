import { CreateReplyBotConfigDto } from '@api/collections/reply-bot-configs/dto/create-reply-bot-config.dto';
import { UpdateReplyBotConfigDto } from '@api/collections/reply-bot-configs/dto/update-reply-bot-config.dto';
import {
  ReplyBotConfig,
  type ReplyBotConfigDocument,
} from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { ReplyBotType } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class ReplyBotConfigsService extends BaseService<
  ReplyBotConfigDocument,
  CreateReplyBotConfigDto,
  UpdateReplyBotConfigDto
> {
  constructor(
    @InjectModel(ReplyBotConfig.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<ReplyBotConfigDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  create(
    createDto: CreateReplyBotConfigDto,
    populate: (string | PopulateOption)[] = [
      { path: 'organization' },
      { path: 'brand' },
      { path: 'credential' },
      { path: 'monitoredAccounts' },
    ],
  ): Promise<ReplyBotConfigDocument> {
    // Set default rate limits if not provided
    const rateLimits = createDto.rateLimits || {
      currentDayCount: 0,
      currentHourCount: 0,
      maxRepliesPerAccountPerDay: 5,
      maxRepliesPerDay: 50,
      maxRepliesPerHour: 10,
    };

    return super.create({ ...createDto, rateLimits }, populate);
  }

  patch(
    id: string,
    updateDto: UpdateReplyBotConfigDto,
    populate: (string | PopulateOption)[] = [
      { path: 'organization' },
      { path: 'brand' },
      { path: 'credential' },
      { path: 'monitoredAccounts' },
    ],
  ): Promise<ReplyBotConfigDocument> {
    return super.patch(id, updateDto, populate);
  }

  /**
   * Toggle the active status of a reply bot config
   */
  async toggleActive(
    id: string,
    organizationId: string,
    brandId?: string,
  ): Promise<ReplyBotConfigDocument> {
    const config = await this.findOne({
      ...(brandId ? { brand: new Types.ObjectId(brandId) } : {}),
      _id: new Types.ObjectId(id),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!config) {
      throw new NotFoundException(`Reply bot config ${id} not found`);
    }

    return this.patch(id, {
      isActive: !config.isActive,
    } as UpdateReplyBotConfigDto);
  }

  /**
   * Find all active configs by organization (alias for findActiveByOrganization)
   */
  findActive(organizationId: string): Promise<ReplyBotConfigDocument[]> {
    return this.find({
      isActive: true,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });
  }

  /**
   * Find all active configs by organization
   */
  findActiveByOrganization(
    organizationId: string,
  ): Promise<ReplyBotConfigDocument[]> {
    return this.findActive(organizationId);
  }

  /**
   * Find a single bot config by ID and organization
   */
  findOneById(
    id: string,
    organizationId: string,
    brandId?: string,
  ): Promise<ReplyBotConfigDocument | null> {
    return this.findOne({
      ...(brandId ? { brand: new Types.ObjectId(brandId) } : {}),
      _id: new Types.ObjectId(id),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });
  }

  /**
   * Find all active configs of a specific type
   */
  findActiveByType(type: ReplyBotType): Promise<ReplyBotConfigDocument[]> {
    return this.find({
      isActive: true,
      isDeleted: false,
      type,
    });
  }

  /**
   * Check if rate limit allows another reply
   */
  async canReply(id: string, organizationId: string): Promise<boolean> {
    const config = await this.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!config || !config.isActive) {
      return false;
    }

    const now = new Date();
    const rateLimits = config.rateLimits;

    // Check if we need to reset hourly counter
    if (!rateLimits.hourResetAt || now >= new Date(rateLimits.hourResetAt)) {
      await this.resetHourlyCounter(id);
      return true;
    }

    // Check if we need to reset daily counter
    if (!rateLimits.dayResetAt || now >= new Date(rateLimits.dayResetAt)) {
      await this.resetDailyCounter(id);
      return true;
    }

    // Check limits
    if (rateLimits.currentHourCount >= rateLimits.maxRepliesPerHour) {
      return false;
    }

    if (rateLimits.currentDayCount >= rateLimits.maxRepliesPerDay) {
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
          totalRepliesSent: 1,
        },
        $set: { lastActivityAt: new Date() },
      },
    );
  }

  /**
   * Increment DM counter
   */
  async incrementDmCounter(id: string): Promise<void> {
    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        $inc: { totalDmsSent: 1 },
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
      { $inc: { totalSkipped: 1 } },
    );
  }

  /**
   * Increment failed counter
   */
  async incrementFailedCounter(id: string): Promise<void> {
    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      { $inc: { totalFailed: 1 } },
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
   * Add a monitored account to the config
   */
  async addMonitoredAccount(
    configId: string,
    accountId: string,
    organizationId: string,
  ): Promise<ReplyBotConfigDocument> {
    const config = await this.findOne({
      _id: new Types.ObjectId(configId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!config) {
      throw new NotFoundException(`Reply bot config ${configId} not found`);
    }

    const monitoredAccounts = config.monitoredAccounts || [];
    const accountObjectId = new Types.ObjectId(accountId);

    if (!monitoredAccounts.some((id) => id.equals(accountObjectId))) {
      monitoredAccounts.push(accountObjectId);
    }

    return this.patch(configId, {
      monitoredAccounts,
    } as UpdateReplyBotConfigDto);
  }

  /**
   * Remove a monitored account from the config
   */
  async removeMonitoredAccount(
    configId: string,
    accountId: string,
    organizationId: string,
  ): Promise<ReplyBotConfigDocument> {
    const config = await this.findOne({
      _id: new Types.ObjectId(configId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!config) {
      throw new NotFoundException(`Reply bot config ${configId} not found`);
    }

    const accountObjectId = new Types.ObjectId(accountId);
    const monitoredAccounts = (config.monitoredAccounts || []).filter(
      (id) => !id.equals(accountObjectId),
    );

    return this.patch(configId, {
      monitoredAccounts,
    } as UpdateReplyBotConfigDto);
  }
}
