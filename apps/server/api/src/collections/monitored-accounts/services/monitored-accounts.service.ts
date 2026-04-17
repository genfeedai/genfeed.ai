import { CreateMonitoredAccountDto } from '@api/collections/monitored-accounts/dto/create-monitored-account.dto';
import { UpdateMonitoredAccountDto } from '@api/collections/monitored-accounts/dto/update-monitored-account.dto';
import type { MonitoredAccountDocument } from '@api/collections/monitored-accounts/schemas/monitored-account.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

type AccountConfig = {
  isActive?: boolean;
  twitterUserId?: string;
  lastCheckedAt?: string;
  lastCheckedTweetId?: string;
  lastProcessedAt?: string;
  lastProcessedTweetId?: string;
  tweetsProcessedCount?: number;
  repliesSentCount?: number;
};

@Injectable()
export class MonitoredAccountsService extends BaseService<
  MonitoredAccountDocument,
  CreateMonitoredAccountDto,
  UpdateMonitoredAccountDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'monitoredAccount', logger);
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
    const account = await this.prisma.monitoredAccount.findFirst({
      where: {
        id,
        isDeleted: false,
        organizationId,
        ...(brandId ? { brandId } : {}),
      },
    });

    if (!account) {
      throw new NotFoundException(`Monitored account ${id} not found`);
    }

    const config = (account.config as AccountConfig) ?? {};
    const updated = await this.prisma.monitoredAccount.update({
      where: { id },
      data: { config: { ...config, isActive: !config.isActive } },
    });

    return updated as unknown as MonitoredAccountDocument;
  }

  /**
   * Find all active monitored accounts for an organization
   */
  async findActiveByOrganization(
    organizationId: string,
  ): Promise<MonitoredAccountDocument[]> {
    const accounts = await this.prisma.monitoredAccount.findMany({
      where: { isDeleted: false, organizationId },
    });

    // isActive is stored in config JSON
    const active = accounts.filter(
      (a) => ((a.config as AccountConfig)?.isActive ?? true) !== false,
    );

    return active as unknown as MonitoredAccountDocument[];
  }

  /**
   * Update the last checked tweet info after polling
   */
  async updateLastChecked(
    id: string,
    lastCheckedTweetId: string,
  ): Promise<MonitoredAccountDocument> {
    const existing = await this.prisma.monitoredAccount.findUnique({
      where: { id },
    });
    const config = (existing?.config as AccountConfig) ?? {};

    const updated = await this.prisma.monitoredAccount.update({
      where: { id },
      data: {
        config: {
          ...config,
          lastCheckedAt: new Date().toISOString(),
          lastCheckedTweetId,
        },
      },
    });

    return updated as unknown as MonitoredAccountDocument;
  }

  /**
   * Increment the tweets processed count
   */
  async incrementProcessedCount(id: string): Promise<void> {
    const existing = await this.prisma.monitoredAccount.findUnique({
      where: { id },
    });
    const config = (existing?.config as AccountConfig) ?? {};

    await this.prisma.monitoredAccount.update({
      where: { id },
      data: {
        config: {
          ...config,
          tweetsProcessedCount: (config.tweetsProcessedCount ?? 0) + 1,
        },
      },
    });
  }

  /**
   * Increment the replies sent count
   */
  async incrementRepliesCount(id: string): Promise<void> {
    const existing = await this.prisma.monitoredAccount.findUnique({
      where: { id },
    });
    const config = (existing?.config as AccountConfig) ?? {};

    await this.prisma.monitoredAccount.update({
      where: { id },
      data: {
        config: {
          ...config,
          repliesSentCount: (config.repliesSentCount ?? 0) + 1,
        },
      },
    });
  }

  /**
   * Find by Twitter user ID (stored in config JSON)
   */
  async findByTwitterUserId(
    twitterUserId: string,
    organizationId: string,
  ): Promise<MonitoredAccountDocument | null> {
    const accounts = await this.prisma.monitoredAccount.findMany({
      where: { isDeleted: false, organizationId },
    });

    const match = accounts.find(
      (a) => (a.config as AccountConfig)?.twitterUserId === twitterUserId,
    );

    return (match ?? null) as unknown as MonitoredAccountDocument | null;
  }

  /**
   * Find all active monitored accounts linked to a specific bot config
   */
  async findByBotConfig(
    botConfigId: string,
    organizationId: string,
  ): Promise<MonitoredAccountDocument[]> {
    const accounts = await this.prisma.monitoredAccount.findMany({
      where: { botConfigId, isDeleted: false, organizationId },
    });

    // filter by isActive from config
    const active = accounts.filter(
      (a) => ((a.config as AccountConfig)?.isActive ?? true) !== false,
    );

    return active as unknown as MonitoredAccountDocument[];
  }

  /**
   * Update the last processed tweet ID after processing tweets
   */
  async updateLastProcessed(
    id: string,
    organizationId: string,
    lastProcessedTweetId: string,
  ): Promise<MonitoredAccountDocument | null> {
    const existing = await this.prisma.monitoredAccount.findFirst({
      where: { id, isDeleted: false, organizationId },
    });

    if (!existing) return null;

    const config = (existing.config as AccountConfig) ?? {};

    const updated = await this.prisma.monitoredAccount.update({
      where: { id },
      data: {
        config: {
          ...config,
          lastProcessedAt: new Date().toISOString(),
          lastProcessedTweetId,
        },
      },
    });

    return updated as unknown as MonitoredAccountDocument;
  }
}
