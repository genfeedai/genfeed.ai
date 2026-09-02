import { CreateMonitoredAccountDto } from '@api/collections/monitored-accounts/dto/create-monitored-account.dto';
import { UpdateMonitoredAccountDto } from '@api/collections/monitored-accounts/dto/update-monitored-account.dto';
import type { MonitoredAccountDocument } from '@api/collections/monitored-accounts/schemas/monitored-account.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import type { PopulateOption } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

const MONITORED_ACCOUNT_CREATE_SCALAR_FIELDS = [
  'botConfigId',
  'brandId',
  'credentialId',
  'isActive',
  'organizationId',
  'userId',
] as const;

const MONITORED_ACCOUNT_UPDATE_SCALAR_FIELDS = [
  'botConfigId',
  'credentialId',
  'isActive',
] as const;

const MONITORED_ACCOUNT_CONFIG_FIELDS = [
  'avatarUrl',
  'bio',
  'displayName',
  'externalId',
  'filters',
  'followersCount',
  'platform',
  'username',
] as const;

type AccountConfig = {
  externalId?: string;
  lastCheckedAt?: string;
  lastCheckedTweetId?: string;
  lastProcessedAt?: string;
  lastProcessedTweetId?: string;
  tweetsProcessedCount?: number;
  repliesSentCount?: number;
};

type MonitoredAccountOwnershipInput = {
  brandId?: string;
  organizationId?: string;
  userId?: string;
};

type MonitoredAccountCreateInput = CreateMonitoredAccountDto &
  MonitoredAccountOwnershipInput;

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

  protected override normalizeDocument(
    document: unknown,
  ): MonitoredAccountDocument {
    const record = super.normalizeDocument(document) as Record<string, unknown>;
    const config =
      record.config !== null &&
      typeof record.config === 'object' &&
      !Array.isArray(record.config)
        ? (record.config as Record<string, unknown>)
        : {};

    return { ...config, ...record } as MonitoredAccountDocument;
  }

  override create(
    input: MonitoredAccountCreateInput,
    populate: (string | PopulateOption)[] = [
      { path: 'organization' },
      { path: 'brand' },
      { path: 'credential' },
    ],
  ): Promise<MonitoredAccountDocument> {
    if (!input.organizationId || !input.userId) {
      throw new BadRequestException(
        'Monitored account creation requires an organization and user id',
      );
    }

    return super.create(
      {
        ...pickDefinedFields(input, MONITORED_ACCOUNT_CREATE_SCALAR_FIELDS),
        config: pickDefinedFields(input, MONITORED_ACCOUNT_CONFIG_FIELDS),
      } as unknown as CreateMonitoredAccountDto,
      populate,
    );
  }

  override async patch(
    id: string,
    input: UpdateMonitoredAccountDto,
    populate: (string | PopulateOption)[] = [
      { path: 'organization' },
      { path: 'brand' },
      { path: 'credential' },
    ],
  ): Promise<MonitoredAccountDocument> {
    const configPatch = pickDefinedFields(
      input,
      MONITORED_ACCOUNT_CONFIG_FIELDS,
    );
    const hasConfigPatch = Object.keys(configPatch).length > 0;
    let config: Record<string, unknown> | undefined;

    if (hasConfigPatch) {
      const existing = await this.prisma.monitoredAccount.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException('MonitoredAccount', id);
      }

      const storedConfig =
        existing.config &&
        typeof existing.config === 'object' &&
        !Array.isArray(existing.config)
          ? (existing.config as Record<string, unknown>)
          : {};
      config = { ...storedConfig, ...configPatch };
    }

    return super.patch(
      id,
      {
        ...pickDefinedFields(input, MONITORED_ACCOUNT_UPDATE_SCALAR_FIELDS),
        ...(config ? { config } : {}),
      } as unknown as UpdateMonitoredAccountDto,
      populate,
    );
  }

  /**
   * Find all active monitored accounts for an organization
   */
  async findActiveByOrganization(
    organizationId: string,
  ): Promise<MonitoredAccountDocument[]> {
    const accounts = await this.prisma.monitoredAccount.findMany({
      where: scopedWhere(organizationId, { isActive: true }),
    });

    return accounts as unknown as MonitoredAccountDocument[];
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
    const existing = await this.findOne({ id });
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
    const existing = await this.findOne({ id });
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
   * Find by platform account ID (stored in config JSON)
   */
  async findByExternalId(
    externalId: string,
    organizationId: string,
  ): Promise<MonitoredAccountDocument | null> {
    const account = await this.prisma.monitoredAccount.findFirst({
      where: scopedWhere(organizationId, {
        config: { equals: externalId, path: ['externalId'] },
      }),
    });

    return (account ?? null) as unknown as MonitoredAccountDocument | null;
  }

  /**
   * Find all active monitored accounts linked to a specific bot config
   */
  async findByBotConfig(
    botConfigId: string,
    organizationId: string,
  ): Promise<MonitoredAccountDocument[]> {
    const accounts = await this.prisma.monitoredAccount.findMany({
      where: scopedWhere(organizationId, { botConfigId, isActive: true }),
    });

    return accounts as unknown as MonitoredAccountDocument[];
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
      where: scopedWhere(organizationId, { id }),
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
