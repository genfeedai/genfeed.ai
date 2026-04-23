import { CreateWatchlistDto } from '@api/collections/watchlists/dto/create-watchlist.dto';
import { UpdateWatchlistDto } from '@api/collections/watchlists/dto/update-watchlist.dto';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { WatchlistPlatform } from '@genfeedai/enums';
import { type Watchlist } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class WatchlistsService extends BaseService<
  Watchlist,
  CreateWatchlistDto,
  UpdateWatchlistDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'watchlist', logger);
  }

  /**
   * Find a watchlist item by platform and handle
   */
  @HandleErrors('find by handle', 'watchlists')
  async findByHandle(
    brandId: string,
    platform: WatchlistPlatform,
    handle: string,
  ): Promise<Watchlist | null> {
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

    return result as unknown as Watchlist | null;
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
  ): Promise<Watchlist | null> {
    this.logOperation('updateMetrics', 'started', { id, metrics });

    const existing = await this.prisma.watchlist.findUnique({
      select: { config: true },
      where: { id: String(id) },
    });

    const currentConfig =
      (existing?.config as Record<string, unknown> | null) ?? {};

    const result = await this.prisma.watchlist.update({
      data: {
        config: {
          ...currentConfig,
          metrics,
        } as never,
      },
      where: { id: String(id) },
    });

    this.logOperation('updateMetrics', 'completed', { id, updated: !!result });

    return result as unknown as Watchlist | null;
  }

  /**
   * Find all watchlist items for a brand
   */
  @HandleErrors('find all by brand', 'watchlists')
  async findAllByAccount(brandId: string): Promise<Watchlist[]> {
    this.logOperation('findAllByAccount', 'started', { brandId });

    const result = await this.prisma.watchlist.findMany({
      orderBy: { createdAt: 'desc' },
      where: { brandId: String(brandId), isDeleted: false },
    });

    this.logOperation('findAllByAccount', 'completed', {
      brandId,
      count: result.length,
    });

    return result as unknown as Watchlist[];
  }
}
