import { CreateReplyBotConfigDto } from '@api/collections/reply-bot-configs/dto/create-reply-bot-config.dto';
import { UpdateReplyBotConfigDto } from '@api/collections/reply-bot-configs/dto/update-reply-bot-config.dto';
import type { ReplyBotConfigDocument } from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { ReplyBotType } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class ReplyBotConfigsService extends BaseService<
  ReplyBotConfigDocument,
  CreateReplyBotConfigDto,
  UpdateReplyBotConfigDto
> {
  constructor(
    public readonly prisma: PrismaService,
    readonly logger: LoggerService,
  ) {
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
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
      ...(brandId ? { brandId } : {}),
      id,
      isDeleted: false,
      organizationId,
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
      organizationId,
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
      ...(brandId ? { brandId } : {}),
      id,
      isDeleted: false,
      organizationId,
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
      id,
      isDeleted: false,
      organizationId,
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
    const config = await this.prisma.replyBotConfig.findFirst({
      where: { id },
    });
    if (!config) return;
    const rateLimits = config.rateLimits as Record<string, unknown>;
    await this.prisma.replyBotConfig.update({
      data: {
        lastActivityAt: new Date(),
        rateLimits: {
          ...rateLimits,
          currentDayCount: ((rateLimits.currentDayCount as number) ?? 0) + 1,
          currentHourCount: ((rateLimits.currentHourCount as number) ?? 0) + 1,
        } as never,
        totalRepliesSent: { increment: 1 },
      } as never,
      where: { id },
    });
  }

  /**
   * Increment DM counter
   */
  async incrementDmCounter(id: string): Promise<void> {
    await this.prisma.replyBotConfig.update({
      data: {
        lastActivityAt: new Date(),
        totalDmsSent: { increment: 1 },
      } as never,
      where: { id },
    });
  }

  /**
   * Increment skipped counter
   */
  async incrementSkippedCounter(id: string): Promise<void> {
    await this.prisma.replyBotConfig.update({
      data: { totalSkipped: { increment: 1 } } as never,
      where: { id },
    });
  }

  /**
   * Increment failed counter
   */
  async incrementFailedCounter(id: string): Promise<void> {
    await this.prisma.replyBotConfig.update({
      data: { totalFailed: { increment: 1 } } as never,
      where: { id },
    });
  }

  /**
   * Reset hourly rate limit counter
   */
  private async resetHourlyCounter(id: string): Promise<void> {
    const hourResetAt = new Date();
    hourResetAt.setHours(hourResetAt.getHours() + 1);

    const config = await this.prisma.replyBotConfig.findFirst({
      where: { id },
    });
    if (!config) return;
    const rateLimits = config.rateLimits as Record<string, unknown>;

    await this.prisma.replyBotConfig.update({
      data: {
        rateLimits: {
          ...rateLimits,
          currentHourCount: 0,
          hourResetAt,
        } as never,
      } as never,
      where: { id },
    });
  }

  /**
   * Reset daily rate limit counter
   */
  private async resetDailyCounter(id: string): Promise<void> {
    const dayResetAt = new Date();
    dayResetAt.setDate(dayResetAt.getDate() + 1);
    dayResetAt.setHours(0, 0, 0, 0);

    const config = await this.prisma.replyBotConfig.findFirst({
      where: { id },
    });
    if (!config) return;
    const rateLimits = config.rateLimits as Record<string, unknown>;

    await this.prisma.replyBotConfig.update({
      data: {
        rateLimits: {
          ...rateLimits,
          currentDayCount: 0,
          dayResetAt,
        } as never,
      } as never,
      where: { id },
    });
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
      id: configId,
      isDeleted: false,
      organizationId,
    });

    if (!config) {
      throw new NotFoundException(`Reply bot config ${configId} not found`);
    }

    const monitoredAccounts: string[] = config.monitoredAccounts ?? [];

    if (!monitoredAccounts.includes(accountId)) {
      monitoredAccounts.push(accountId);
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
      id: configId,
      isDeleted: false,
      organizationId,
    });

    if (!config) {
      throw new NotFoundException(`Reply bot config ${configId} not found`);
    }

    const monitoredAccounts = (config.monitoredAccounts ?? []).filter(
      (id: string) => id !== accountId,
    );

    return this.patch(configId, {
      monitoredAccounts,
    } as UpdateReplyBotConfigDto);
  }
}
