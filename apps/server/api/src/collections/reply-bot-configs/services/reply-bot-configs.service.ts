import { CreateReplyBotConfigDto } from '@api/collections/reply-bot-configs/dto/create-reply-bot-config.dto';
import { UpdateReplyBotConfigDto } from '@api/collections/reply-bot-configs/dto/update-reply-bot-config.dto';
import type {
  ReplyBotConfigDocument,
  ReplyBotRateLimits,
} from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { ReplyBotType } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Helper: defensively parse the `config` JSON column
// ---------------------------------------------------------------------------
function parseConfigJson(raw: unknown): Record<string, unknown> {
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
    super(prisma, 'replyBotConfig', logger);
  }

  private normalizeRateLimits(
    rateLimits?: ReplyBotRateLimits,
  ): ReplyBotRateLimits & {
    currentDayCount: number;
    currentHourCount: number;
    maxRepliesPerAccountPerDay: number;
    maxRepliesPerDay: number;
    maxRepliesPerHour: number;
  } {
    return {
      currentDayCount: 0,
      currentHourCount: 0,
      maxRepliesPerAccountPerDay: 5,
      maxRepliesPerDay: 50,
      maxRepliesPerHour: 10,
      ...rateLimits,
    };
  }

  create(
    createDto: CreateReplyBotConfigDto,
    populate: (string | PopulateOption)[] = [],
  ): Promise<ReplyBotConfigDocument> {
    const rateLimits = this.normalizeRateLimits(
      (createDto as unknown as Record<string, unknown>).rateLimits as
        | ReplyBotRateLimits
        | undefined,
    );

    // Extract Prisma scalar columns from DTO; pack domain fields into `config`.
    const {
      organization,
      organizationId,
      brand,
      brandId,
      user,
      userId,
      ...domainFields
    } = createDto as CreateReplyBotConfigDto & Record<string, unknown>;

    const config: Record<string, unknown> = {
      ...domainFields,
      lastActivityAt: null,
      rateLimits,
      totalDmsSent: 0,
      totalFailed: 0,
      totalRepliesSent: 0,
      totalSkipped: 0,
    };

    const prismaDto = {
      ...(brandId || brand ? { brandId: (brandId || brand) as string } : {}),
      ...(organizationId || organization
        ? { organizationId: (organizationId || organization) as string }
        : {}),
      ...(userId || user ? { userId: (userId || user) as string } : {}),
      config,
    };

    return super.create(
      prismaDto as unknown as CreateReplyBotConfigDto,
      populate,
    );
  }

  patch(
    id: string,
    updateDto: UpdateReplyBotConfigDto,
    populate: (string | PopulateOption)[] = [],
  ): Promise<ReplyBotConfigDocument> {
    return super.patch(id, updateDto, populate);
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
    const rateLimits = this.normalizeRateLimits(config.rateLimits);

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
  private async readConfig(
    id: string,
  ): Promise<Record<string, unknown> | null> {
    const row = await this.prisma.replyBotConfig.findFirst({
      where: { id },
    });
    if (!row) return null;
    return parseConfigJson((row as unknown as Record<string, unknown>).config);
  }

  async incrementReplyCounters(id: string): Promise<void> {
    const cfg = await this.readConfig(id);
    if (!cfg) return;
    const rateLimits = this.normalizeRateLimits(
      cfg.rateLimits as ReplyBotRateLimits | undefined,
    );
    await this.prisma.replyBotConfig.update({
      data: {
        config: {
          ...cfg,
          lastActivityAt: new Date().toISOString(),
          rateLimits: {
            ...rateLimits,
            currentDayCount: (rateLimits.currentDayCount ?? 0) + 1,
            currentHourCount: (rateLimits.currentHourCount ?? 0) + 1,
          },
          totalRepliesSent: ((cfg.totalRepliesSent as number) ?? 0) + 1,
        },
      },
      where: { id },
    });
  }

  async incrementDmCounter(id: string): Promise<void> {
    const cfg = await this.readConfig(id);
    if (!cfg) return;
    await this.prisma.replyBotConfig.update({
      data: {
        config: {
          ...cfg,
          lastActivityAt: new Date().toISOString(),
          totalDmsSent: ((cfg.totalDmsSent as number) ?? 0) + 1,
        },
      },
      where: { id },
    });
  }

  async incrementSkippedCounter(id: string): Promise<void> {
    const cfg = await this.readConfig(id);
    if (!cfg) return;
    await this.prisma.replyBotConfig.update({
      data: {
        config: {
          ...cfg,
          totalSkipped: ((cfg.totalSkipped as number) ?? 0) + 1,
        },
      },
      where: { id },
    });
  }

  async incrementFailedCounter(id: string): Promise<void> {
    const cfg = await this.readConfig(id);
    if (!cfg) return;
    await this.prisma.replyBotConfig.update({
      data: {
        config: {
          ...cfg,
          totalFailed: ((cfg.totalFailed as number) ?? 0) + 1,
        },
      },
      where: { id },
    });
  }

  /**
   * Reset hourly rate limit counter
   */
  private async resetHourlyCounter(id: string): Promise<void> {
    const hourResetAt = new Date();
    hourResetAt.setHours(hourResetAt.getHours() + 1);

    const cfg = await this.readConfig(id);
    if (!cfg) return;
    const rateLimits = this.normalizeRateLimits(
      cfg.rateLimits as ReplyBotRateLimits | undefined,
    );

    await this.prisma.replyBotConfig.update({
      data: {
        config: {
          ...cfg,
          rateLimits: {
            ...rateLimits,
            currentHourCount: 0,
            hourResetAt: hourResetAt.toISOString(),
          },
        },
      },
      where: { id },
    });
  }

  private async resetDailyCounter(id: string): Promise<void> {
    const dayResetAt = new Date();
    dayResetAt.setDate(dayResetAt.getDate() + 1);
    dayResetAt.setHours(0, 0, 0, 0);

    const cfg = await this.readConfig(id);
    if (!cfg) return;
    const rateLimits = this.normalizeRateLimits(
      cfg.rateLimits as ReplyBotRateLimits | undefined,
    );

    await this.prisma.replyBotConfig.update({
      data: {
        config: {
          ...cfg,
          rateLimits: {
            ...rateLimits,
            currentDayCount: 0,
            dayResetAt: dayResetAt.toISOString(),
          },
        },
      },
      where: { id },
    });
  }

  /**
   * Add a monitored account to the config.
   * monitoredAccounts lives inside the `config` JSON column.
   */
  async addMonitoredAccount(
    configId: string,
    accountId: string,
    organizationId: string,
  ): Promise<ReplyBotConfigDocument> {
    const existing = await this.findOne({
      id: configId,
      isDeleted: false,
      organizationId,
    });

    if (!existing) {
      throw new NotFoundException(`Reply bot config ${configId} not found`);
    }

    const monitoredAccounts: string[] = existing.monitoredAccounts ?? [];
    if (!monitoredAccounts.includes(accountId)) {
      monitoredAccounts.push(accountId);
    }

    const cfg = await this.readConfig(configId);
    if (!cfg) {
      throw new NotFoundException(`Reply bot config ${configId} not found`);
    }

    const updated = await this.prisma.replyBotConfig.update({
      data: {
        config: { ...cfg, monitoredAccounts } as never,
      } as never,
      where: { id: configId },
    });

    return this.normalizeDocument(updated) as ReplyBotConfigDocument;
  }

  /**
   * Remove a monitored account from the config.
   * monitoredAccounts lives inside the `config` JSON column.
   */
  async removeMonitoredAccount(
    configId: string,
    accountId: string,
    organizationId: string,
  ): Promise<ReplyBotConfigDocument> {
    const existing = await this.findOne({
      id: configId,
      isDeleted: false,
      organizationId,
    });

    if (!existing) {
      throw new NotFoundException(`Reply bot config ${configId} not found`);
    }

    const monitoredAccounts = (existing.monitoredAccounts ?? []).filter(
      (id: string) => id !== accountId,
    );

    const cfg = await this.readConfig(configId);
    if (!cfg) {
      throw new NotFoundException(`Reply bot config ${configId} not found`);
    }

    const updated = await this.prisma.replyBotConfig.update({
      data: {
        config: { ...cfg, monitoredAccounts } as never,
      } as never,
      where: { id: configId },
    });

    return this.normalizeDocument(updated) as ReplyBotConfigDocument;
  }
}
