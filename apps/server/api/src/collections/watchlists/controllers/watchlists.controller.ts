import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateWatchlistDto } from '@api/collections/watchlists/dto/create-watchlist.dto';
import { UpdateWatchlistDto } from '@api/collections/watchlists/dto/update-watchlist.dto';
import { WatchlistsService } from '@api/collections/watchlists/services/watchlists.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BrandScopeQueryDto } from '@api/helpers/dto/brand-scope-query.dto';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { WatchlistPlatform } from '@genfeedai/enums';
import { WatchlistSerializer } from '@genfeedai/serializers';
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('watchlists')
export class WatchlistsController {
  constructor(protected readonly service: WatchlistsService) {}

  /**
   * Get all watchlist items for the current brand
   */
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto = {},
  ) {
    const brand = user.brandId;
    const brandId = query.brandId || brand;

    if (!brandId) {
      throw new NotFoundException({ message: 'Account ID is required' });
    }

    const items = await this.service.findAllByAccount(brandId);
    return serializeCollection(req, WatchlistSerializer, { docs: items });
  }

  /**
   * Get a single watchlist item
   */
  @Get(':watchlistId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() req: Request,
    @Param('watchlistId') watchlistId: string,
  ) {
    const item = await this.service.findOne({
      id: watchlistId,
    });
    if (!item) {
      throw new NotFoundException('Watchlist item');
    }
    return serializeSingle(req, WatchlistSerializer, item);
  }

  /**
   * Create a new watchlist item.
   *
   * Applies server-side defaults for ownership and `label`
   * (quick-add semantics) and upserts: if a watchlist item already exists
   * for the same brand/platform/handle, the existing item is returned
   * instead of throwing a conflict.
   */
  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Body() dto: CreateWatchlistDto,
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto = {},
  ) {
    const organization = user.organizationId;
    const brand = user.brandId;
    const dbUserId = user.userId ?? user.id;
    const brandId = query.brandId || brand;

    if (!brandId) {
      throw new NotFoundException({ message: 'Account ID is required' });
    }

    const existing = await this.service.findByHandle(
      brandId,
      dto.platform,
      dto.handle,
    );

    if (existing) {
      // Upsert: return the existing item instead of erroring
      return serializeSingle(req, WatchlistSerializer, existing);
    }

    const item = await this.service.create({
      ...dto,
      brandId,
      label: dto.label || `@${dto.handle}`, // Default label to handle
      organizationId: organization,
      userId: dbUserId,
    });
    return serializeSingle(req, WatchlistSerializer, item);
  }

  /**
   * Update a watchlist item
   */
  @Patch(':watchlistId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() req: Request,
    @Param('watchlistId') watchlistId: string,
    @Body() dto: UpdateWatchlistDto,
  ) {
    const existing = await this.service.findOne({
      id: watchlistId,
    });
    if (!existing) {
      throw new NotFoundException('Watchlist item');
    }

    // If updating platform or handle, check for duplicates
    if (dto.platform || dto.handle) {
      const platform =
        dto.platform || (existing.platform as WatchlistPlatform | null);
      const handle = dto.handle || existing.handle;
      const brandId = existing.brandId ?? undefined;

      if (!brandId || !platform || !handle) {
        throw new ConflictException(
          'Watchlist item is missing duplicate-check data',
        );
      }

      const duplicate = await this.service.findByHandle(
        brandId,
        platform,
        handle,
      );

      if (duplicate && duplicate.id !== watchlistId) {
        throw new ConflictException(
          'A watchlist item with this handle already exists',
        );
      }
    }

    const updated = await this.service.patch(watchlistId, dto);
    return serializeSingle(req, WatchlistSerializer, updated);
  }

  /**
   * Delete a watchlist item (soft delete)
   */
  @Delete(':watchlistId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async delete(@Param('watchlistId') watchlistId: string) {
    await this.service.remove(watchlistId);
    return { success: true };
  }
}
