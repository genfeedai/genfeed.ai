import { CreateMonitoredAccountDto } from '@api/collections/monitored-accounts/dto/create-monitored-account.dto';
import { UpdateMonitoredAccountDto } from '@api/collections/monitored-accounts/dto/update-monitored-account.dto';
import {
  MonitoredAccount,
  type MonitoredAccountDocument,
} from '@api/collections/monitored-accounts/schemas/monitored-account.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class MonitoredAccountsService extends BaseService<
  MonitoredAccountDocument,
  CreateMonitoredAccountDto,
  UpdateMonitoredAccountDto
> {
  constructor(
    @InjectModel(MonitoredAccount.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<MonitoredAccountDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  create(
    createDto: CreateMonitoredAccountDto,
    populate: (string | PopulateOption)[] = [
      { path: 'organization' },
      { path: 'brand' },
      { path: 'credential' },
    ],
  ): Promise<MonitoredAccountDocument> {
    return super.create(createDto, populate);
  }

  patch(
    id: string,
    updateDto: UpdateMonitoredAccountDto,
    populate: (string | PopulateOption)[] = [
      { path: 'organization' },
      { path: 'brand' },
      { path: 'credential' },
    ],
  ): Promise<MonitoredAccountDocument> {
    return super.patch(id, updateDto, populate);
  }

  /**
   * Toggle the active status of a monitored account
   */
  async toggleActive(
    id: string,
    organizationId: string,
    brandId?: string,
  ): Promise<MonitoredAccountDocument> {
    const account = await this.findOne({
      ...(brandId ? { brand: new Types.ObjectId(brandId) } : {}),
      _id: new Types.ObjectId(id),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!account) {
      throw new NotFoundException(`Monitored account ${id} not found`);
    }

    return this.patch(id, {
      isActive: !account.isActive,
    } as UpdateMonitoredAccountDto);
  }

  /**
   * Find all active monitored accounts for an organization
   */
  findActiveByOrganization(
    organizationId: string,
  ): Promise<MonitoredAccountDocument[]> {
    return this.find({
      isActive: true,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });
  }

  /**
   * Update the last checked tweet info after polling
   */
  updateLastChecked(
    id: string,
    lastCheckedTweetId: string,
  ): Promise<MonitoredAccountDocument> {
    return this.patch(id, {
      lastCheckedAt: new Date(),
      lastCheckedTweetId,
    } as UpdateMonitoredAccountDto);
  }

  /**
   * Increment the tweets processed count
   */
  async incrementProcessedCount(id: string): Promise<void> {
    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      { $inc: { tweetsProcessedCount: 1 } },
    );
  }

  /**
   * Increment the replies sent count
   */
  async incrementRepliesCount(id: string): Promise<void> {
    await this.model.updateOne(
      { _id: new Types.ObjectId(id) },
      { $inc: { repliesSentCount: 1 } },
    );
  }

  /**
   * Find by Twitter user ID
   */
  findByTwitterUserId(
    twitterUserId: string,
    organizationId: string,
  ): Promise<MonitoredAccountDocument | null> {
    return this.findOne({
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      twitterUserId,
    });
  }

  /**
   * Find all active monitored accounts linked to a specific bot config
   */
  findByBotConfig(
    botConfigId: string,
    organizationId: string,
  ): Promise<MonitoredAccountDocument[]> {
    return this.find({
      botConfig: new Types.ObjectId(botConfigId),
      isActive: true,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });
  }

  /**
   * Update the last processed tweet ID after processing tweets
   */
  updateLastProcessed(
    id: string,
    organizationId: string,
    lastProcessedTweetId: string,
  ): Promise<MonitoredAccountDocument | null> {
    return this.model.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        $set: {
          lastProcessedAt: new Date(),
          lastProcessedTweetId,
        },
      },
      { returnDocument: 'after' },
    );
  }
}
