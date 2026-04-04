import { CreateWatchlistDto } from '@api/collections/watchlists/dto/create-watchlist.dto';
import { QuickAddWatchlistsDto } from '@api/collections/watchlists/dto/quick-add-watchlist.dto';
import { UpdateWatchlistDto } from '@api/collections/watchlists/dto/update-watchlist.dto';
import { WatchlistsService } from '@api/collections/watchlists/services/watchlists.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { WatchlistSerializer } from '@genfeedai/serializers';
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
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
  async findAll(@Req() req: Request, @CurrentUser() user: User) {
    const { brand } = getPublicMetadata(user);
    const brandId = (req.query.brand as string) || brand;

    if (!brandId) {
      throw new NotFoundException('Account ID is required');
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
      _id: watchlistId,
      isDeleted: false,
    });
    if (!item) {
      throw new NotFoundException('Watchlist item not found');
    }
    return serializeSingle(req, WatchlistSerializer, item);
  }

  /**
   * Create a new watchlist item
   */
  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Body() dto: CreateWatchlistDto,
    @Req() req: Request,
    @CurrentUser() user: User,
  ) {
    const { organization, user: dbUserId } = getPublicMetadata(user);

    const existing = await this.service.findByHandle(
      dto.brand,
      dto.platform,
      dto.handle,
    );

    if (existing) {
      throw new ConflictException('This creator is already in your watchlist');
    }

    if (!dto.user) {
      dto.user = dbUserId;
    }
    if (!dto.organization) {
      dto.organization = organization;
    }

    const item = await this.service.create(dto);
    return serializeSingle(req, WatchlistSerializer, item);
  }

  /**
   * Quick add from extension - simplified creation with auto-detection
   */
  @Post('quick-add')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async quickAdd(
    @Body() dto: QuickAddWatchlistsDto,
    @Req() req: Request,
    @CurrentUser() user: User,
  ) {
    const { organization, brand, user: dbUserId } = getPublicMetadata(user);
    const brandId = (req.query.brand as string) || brand;

    if (!brandId) {
      throw new NotFoundException('Account ID is required');
    }

    const existing = await this.service.findByHandle(
      brandId,
      dto.platform,
      dto.handle,
    );

    if (existing) {
      // Return existing item instead of error for better UX
      return serializeSingle(req, WatchlistSerializer, existing);
    }

    // Create with minimal data - name defaults to handle
    const createDto: CreateWatchlistDto = {
      brand: brandId,
      handle: dto.handle,
      label: `@${dto.handle}`, // Default label to handle
      organization,
      platform: dto.platform,
      user: dbUserId,
    };

    const item = await this.service.create(createDto);
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
      _id: watchlistId,
      isDeleted: false,
    });
    if (!existing) {
      throw new NotFoundException('Watchlist item not found');
    }

    // If updating platform or handle, check for duplicates
    if (dto.platform || dto.handle) {
      const platform = dto.platform || existing.platform;
      const handle = dto.handle || existing.handle;

      const duplicate = await this.service.findByHandle(
        existing.brand,
        platform as unknown,
        handle,
      );

      if (duplicate && duplicate._id.toString() !== watchlistId) {
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
