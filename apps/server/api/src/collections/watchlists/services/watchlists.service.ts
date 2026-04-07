import { CreateWatchlistDto } from '@api/collections/watchlists/dto/create-watchlist.dto';
import { UpdateWatchlistDto } from '@api/collections/watchlists/dto/update-watchlist.dto';
import { Watchlist } from '@api/collections/watchlists/schemas/watchlist.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { WatchlistPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class WatchlistsService extends BaseService<
  Watchlist,
  CreateWatchlistDto,
  UpdateWatchlistDto
> {
  constructor(
    @InjectModel(Watchlist.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<Watchlist>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }

  /**
   * Find a watchlist item by platform and handle
   */
  @HandleErrors('find by handle', 'watchlists')
  async findByHandle(
    brandId: string | Types.ObjectId,
    platform: WatchlistPlatform,
    handle: string,
  ): Promise<Watchlist | null> {
    this.logOperation('findByHandle', 'started', {
      brandId,
      handle,
      platform,
    });

    const result = await this.model.findOne({
      brand: brandId,
      handle: handle.replace('@', ''),
      isDeleted: false,
      platform,
    });

    this.logOperation('findByHandle', 'completed', {
      brandId,
      found: !!result,
      handle,
      platform,
    });

    return result;
  }

  /**
   * Update metrics for a watchlist item
   */
  @HandleErrors('update metrics', 'watchlists')
  async updateMetrics(
    id: string | Types.ObjectId,
    metrics: {
      followers?: number;
      avgViews?: number;
      engagementRate?: number;
    },
  ): Promise<Watchlist | null> {
    this.logOperation('updateMetrics', 'started', { id, metrics });

    const result = await this.model.findByIdAndUpdate(
      id,
      { $set: { metrics } },
      { returnDocument: 'after' },
    );

    this.logOperation('updateMetrics', 'completed', { id, updated: !!result });

    return result;
  }

  /**
   * Find all watchlist items for an brand
   */
  @HandleErrors('find all by brand', 'watchlists')
  async findAllByAccount(
    brandId: string | Types.ObjectId,
  ): Promise<Watchlist[]> {
    this.logOperation('findAllByAccount', 'started', { brandId });

    const result = await this.model
      .find({
        brand: brandId,
        isDeleted: false,
      })
      .sort({ createdAt: -1 })
      .exec();

    this.logOperation('findAllByAccount', 'completed', {
      brandId,
      count: result.length,
    });

    return result;
  }
}
