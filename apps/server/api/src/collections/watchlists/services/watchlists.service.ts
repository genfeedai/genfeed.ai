import { CreateWatchlistDto } from '@api/collections/watchlists/dto/create-watchlist.dto';
import { UpdateWatchlistDto } from '@api/collections/watchlists/dto/update-watchlist.dto';
import type { WatchlistDocument } from '@api/collections/watchlists/schemas/watchlist.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import { WatchlistPlatform } from '@genfeedai/contracts';
import type { PopulateOption } from '@genfeedai/contracts/interfaces';
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

const WATCHLIST_CREATE_SCALAR_FIELDS = [
  'brandId',
  'handle',
  'organizationId',
  'platform',
  'userId',
] as const;

const WATCHLIST_UPDATE_SCALAR_FIELDS = [
  'handle',
  'isDeleted',
  'platform',
] as const;

const WATCHLIST_CONFIG_FIELDS = [
  'avatarUrl',
  'category',
  'label',
  'metrics',
  'notes',
  'profileUrl',
] as const;

type WatchlistOwnershipInput = {
  brandId: string;
  organizationId: string;
  userId: string;
};

type WatchlistCreateInput = CreateWatchlistDto & WatchlistOwnershipInput;

@Injectable()
export class WatchlistsService extends BaseService<
  WatchlistDocument,
  CreateWatchlistDto,
  UpdateWatchlistDto,
  Prisma.WatchlistWhereInput
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'watchlist', logger);
  }

  protected override normalizeDocument(document: unknown): WatchlistDocument {
    const record = super.normalizeDocument(document) as unknown as Record<
      string,
      unknown
    >;
    const config =
      record.config !== null &&
      typeof record.config === 'object' &&
      !Array.isArray(record.config)
        ? (record.config as Record<string, unknown>)
        : {};

    return { ...config, ...record } as unknown as WatchlistDocument;
  }

  override create(
    input: WatchlistCreateInput,
    populate: (string | PopulateOption)[] = [],
  ): Promise<WatchlistDocument> {
    if (!input.brandId || !input.organizationId || !input.userId) {
      throw new BadRequestException(
        'Watchlist creation requires brand, organization, and user ids',
      );
    }

    return super.create(
      {
        ...pickDefinedFields(input, WATCHLIST_CREATE_SCALAR_FIELDS),
        config: pickDefinedFields(input, WATCHLIST_CONFIG_FIELDS),
      } as unknown as CreateWatchlistDto,
      populate,
    );
  }

  override async patch(
    id: string,
    input: UpdateWatchlistDto,
    populate: (string | PopulateOption)[] = [],
  ): Promise<WatchlistDocument> {
    const configPatch = pickDefinedFields(input, WATCHLIST_CONFIG_FIELDS);
    const hasConfigPatch = Object.keys(configPatch).length > 0;
    let config: Record<string, unknown> | undefined;

    if (hasConfigPatch) {
      const existing = await this.findOne({ id });
      if (!existing) {
        throw new NotFoundException('Watchlist', id);
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
        ...pickDefinedFields(input, WATCHLIST_UPDATE_SCALAR_FIELDS),
        ...(config ? { config } : {}),
      } as unknown as UpdateWatchlistDto,
      populate,
    );
  }

  /**
   * Find a watchlist item by platform and handle
   */
  @HandleErrors('find by handle', 'watchlists')
  async findByHandle(
    brandId: string,
    platform: WatchlistPlatform,
    handle: string,
  ): Promise<WatchlistDocument | null> {
    this.logOperation('findByHandle', 'started', {
      brandId,
      handle,
      platform,
    });

    const result = await this.prisma.watchlist.findFirst({
      where: {
        brandId: String(brandId),
        handle: handle.replace('@', ''),
        isDeleted: false,
        platform,
      },
    });

    this.logOperation('findByHandle', 'completed', {
      brandId,
      found: !!result,
      handle,
      platform,
    });

    return result ? this.normalizeDocument(result) : null;
  }

  /**
   * Update metrics for a watchlist item
   */
  @HandleErrors('update metrics', 'watchlists')
  async updateMetrics(
    id: string,
    metrics: {
      followers?: number;
      avgViews?: number;
      engagementRate?: number;
    },
  ): Promise<WatchlistDocument | null> {
    this.logOperation('updateMetrics', 'started', { id, metrics });

    // tenant-scope-ignore: bootstrap read recovers organizationId for the scoped write; watchlist id is globally unique
    const existing = await this.prisma.watchlist.findFirst({
      select: { config: true, organizationId: true },
      where: { id: String(id), isDeleted: false },
    });

    if (!existing?.organizationId) {
      return null;
    }

    const currentConfig =
      (existing.config as Record<string, unknown> | null) ?? {};

    const result = await this.prisma.watchlist.update({
      data: {
        config: toPrismaJson({
          ...currentConfig,
          metrics,
        }),
      },
      where: scopedWhere(existing.organizationId, { id: String(id) }),
    });

    this.logOperation('updateMetrics', 'completed', { id, updated: !!result });

    return result ? this.normalizeDocument(result) : null;
  }

  /**
   * Find all watchlist items for a brand
   */
  @HandleErrors('find all by brand', 'watchlists')
  async findAllByAccount(brandId: string): Promise<WatchlistDocument[]> {
    this.logOperation('findAllByAccount', 'started', { brandId });

    const result = await this.prisma.watchlist.findMany({
      orderBy: { createdAt: 'desc' },
      where: { brandId: String(brandId), isDeleted: false },
    });

    this.logOperation('findAllByAccount', 'completed', {
      brandId,
      count: result.length,
    });

    return this.normalizeDocuments(result);
  }
}
