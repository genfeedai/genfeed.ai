import { CreateReplyBotConfigDto } from '@api/collections/reply-bot-configs/dto/create-reply-bot-config.dto';
import type { ReplyBotRateLimitsDto } from '@api/collections/reply-bot-configs/dto/reply-bot-rate-limits.dto';
import { UpdateReplyBotConfigDto } from '@api/collections/reply-bot-configs/dto/update-reply-bot-config.dto';
import type {
  ReplyBotConfigDocument,
  ReplyBotRateLimits,
} from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import { ReplyBotType } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

const REPLY_BOT_CREATE_SCALAR_FIELDS = [
  'actionType',
  'brandId',
  'isActive',
  'organizationId',
  'type',
  'userId',
] as const;

const REPLY_BOT_UPDATE_SCALAR_FIELDS = [
  'actionType',
  'isActive',
  'type',
] as const;

const REPLY_BOT_CONFIG_FIELDS = [
  'context',
  'credentialId',
  'description',
  'dmConfig',
  'filters',
  'name',
  'platform',
  'rateLimits',
  'replyInstructions',
  'replyLength',
  'replyTone',
  'schedule',
] as const;

type ReplyBotOwnershipInput = {
  brandId?: string;
  organizationId?: string;
  userId?: string;
};

type ReplyBotCreateInput = CreateReplyBotConfigDto & ReplyBotOwnershipInput;

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

  protected override normalizeDocument(
    document: unknown,
  ): ReplyBotConfigDocument {
    const normalized = super.normalizeDocument(document) as Record<
      string,
      unknown
    >;
    const monitoredAccounts = normalized.monitoredAccounts;

    if (Array.isArray(monitoredAccounts)) {
      normalized.monitoredAccountIds = monitoredAccounts.flatMap((account) => {
        if (typeof account === 'string') {
          return [account];
        }
        if (
          account &&
          typeof account === 'object' &&
          typeof (account as { id?: unknown }).id === 'string'
        ) {
          return [(account as { id: string }).id];
        }
        return [];
      });
    }

    return normalized as unknown as ReplyBotConfigDocument;
  }

  private async syncMonitoredAccounts(
    configId: string,
    organizationId: string,
    accountIds: string[],
  ): Promise<void> {
    const uniqueAccountIds = [...new Set(accountIds)];
    const operations = [
      this.prisma.monitoredAccount.updateMany({
        data: { botConfigId: null },
        where: scopedWhere(organizationId, { botConfigId: configId }),
      }),
    ];

    if (uniqueAccountIds.length > 0) {
      operations.push(
        this.prisma.monitoredAccount.updateMany({
          data: { botConfigId: configId },
          where: {
            id: { in: uniqueAccountIds },
            isDeleted: false,
            organizationId,
          },
        }),
      );
    }

    await this.prisma.$transaction(operations);
  }

  private normalizeRateLimits(
    rateLimits?: ReplyBotRateLimits | ReplyBotRateLimitsDto,
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

  override async create(
    input: ReplyBotCreateInput,
    populate: (string | PopulateOption)[] = [],
  ): Promise<ReplyBotConfigDocument> {
    if (!input.organizationId || !input.userId) {
      throw new BadRequestException(
        'Reply bot creation requires an organization and user id',
      );
    }

    if (input.isActive && !input.credentialId) {
      throw new BadRequestException(
        'An active reply bot requires a credential id',
      );
    }

    const domainFields = pickDefinedFields(input, REPLY_BOT_CONFIG_FIELDS);

    const config: Record<string, unknown> = {
      ...domainFields,
      lastActivityAt: null,
      rateLimits: this.normalizeRateLimits(input.rateLimits),
      totalDmsSent: 0,
      totalFailed: 0,
      totalRepliesSent: 0,
      totalSkipped: 0,
    };

    const created = await super.create(
      {
        ...pickDefinedFields(input, REPLY_BOT_CREATE_SCALAR_FIELDS),
        isActive: input.isActive ?? false,
        config,
      } as unknown as CreateReplyBotConfigDto,
      populate,
    );

    if (input.monitoredAccountIds !== undefined) {
      await this.syncMonitoredAccounts(
        created.id,
        input.organizationId,
        input.monitoredAccountIds,
      );
      return (await this.findOne({ id: created.id }, populate)) ?? created;
    }

    return created;
  }

  override async patch(
    id: string,
    input: UpdateReplyBotConfigDto,
    populate: (string | PopulateOption)[] = [],
  ): Promise<ReplyBotConfigDocument> {
    const configPatch = pickDefinedFields(input, REPLY_BOT_CONFIG_FIELDS);
    const needsExisting =
      Object.keys(configPatch).length > 0 ||
      input.isActive === true ||
      input.monitoredAccountIds !== undefined;
    let existingOrganizationId: string | undefined;
    let config: Record<string, unknown> | undefined;

    if (needsExisting) {
      const existing = await this.findOne({ id });
      if (!existing) {
        throw new NotFoundException('ReplyBotConfig', id);
      }
      existingOrganizationId = existing.organizationId;

      const storedConfig = parseConfigJson(existing.config);
      config = {
        ...storedConfig,
        ...configPatch,
        ...(input.rateLimits
          ? { rateLimits: this.normalizeRateLimits(input.rateLimits) }
          : {}),
      };

      if (input.isActive && !config.credentialId) {
        throw new BadRequestException(
          'An active reply bot requires a credential id',
        );
      }
    }

    const updated = await super.patch(
      id,
      {
        ...pickDefinedFields(input, REPLY_BOT_UPDATE_SCALAR_FIELDS),
        ...(config ? { config } : {}),
      } as unknown as UpdateReplyBotConfigDto,
      populate,
    );

    if (input.monitoredAccountIds !== undefined) {
      if (!existingOrganizationId) {
        throw new BadRequestException(
          'Reply bot monitored accounts require an organization id',
        );
      }
      await this.syncMonitoredAccounts(
        id,
        existingOrganizationId,
        input.monitoredAccountIds,
      );
      return (await this.findOne({ id }, populate)) ?? updated;
    }

    return updated;
  }

  /**
   * Find all active configs by organization (alias for findActiveByOrganization)
   */
  findActive(organizationId: string): Promise<ReplyBotConfigDocument[]> {
    return this.find(scopedWhere(organizationId, { isActive: true }));
  }

  /**
   * Find every active config across all organizations.
   *
   * Platform-wide cron fan-out is driven by this scarce set instead of by the
   * full tenant list — there are far fewer active reply bots than
   * organizations, so one cross-org read replaces one query per tenant.
   * Soft-deleted organizations are excluded in the same read so the result
   * matches a scan that only ever visited live organizations.
   */
  findAllActive(): Promise<ReplyBotConfigDocument[]> {
    return this.find({
      isActive: true,
      organization: { is: { isDeleted: false } },
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
    return this.findOne(
      scopedWhere(organizationId, { ...(brandId ? { brandId } : {}), id }),
    );
  }

  /**
   * Find all active configs of a specific type
   */
  findActiveByType(type: ReplyBotType): Promise<ReplyBotConfigDocument[]> {
    return this.find({
      isActive: true,
      type,
    });
  }

  /**
   * Check if rate limit allows another reply
   */
  async canReply(id: string, organizationId: string): Promise<boolean> {
    const config = await this.findOne(scopedWhere(organizationId, { id }));

    if (!config?.isActive) {
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
   * The Prisma relation is authoritative; no duplicate ID array is stored.
   */
  async addMonitoredAccount(
    configId: string,
    accountId: string,
    organizationId: string,
  ): Promise<ReplyBotConfigDocument> {
    const existing = await this.findOne(
      scopedWhere(organizationId, { id: configId }),
    );

    if (!existing) {
      throw new NotFoundException(`Reply bot config ${configId} not found`);
    }

    await this.prisma.monitoredAccount.updateMany({
      data: { botConfigId: configId },
      where: {
        id: accountId,
        isDeleted: false,
        organizationId,
      },
    });

    return (
      (await this.findOne(scopedWhere(organizationId, { id: configId }), [
        { path: 'monitoredAccounts' },
      ])) ?? existing
    );
  }

  /**
   * Remove a monitored account from the config.
   * The Prisma relation is authoritative; no duplicate ID array is stored.
   */
  async removeMonitoredAccount(
    configId: string,
    accountId: string,
    organizationId: string,
  ): Promise<ReplyBotConfigDocument> {
    const existing = await this.findOne(
      scopedWhere(organizationId, { id: configId }),
    );

    if (!existing) {
      throw new NotFoundException(`Reply bot config ${configId} not found`);
    }

    await this.prisma.monitoredAccount.updateMany({
      data: { botConfigId: null },
      where: {
        botConfigId: configId,
        id: accountId,
        isDeleted: false,
        organizationId,
      },
    });

    return (
      (await this.findOne(scopedWhere(organizationId, { id: configId }), [
        { path: 'monitoredAccounts' },
      ])) ?? existing
    );
  }
}
