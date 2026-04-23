import { BookmarksQueryDto } from '@api/collections/bookmarks/dto/bookmarks-query.dto';
import { CreateBookmarkDto } from '@api/collections/bookmarks/dto/create-bookmark.dto';
import { UpdateBookmarkDto } from '@api/collections/bookmarks/dto/update-bookmark.dto';
import { type BookmarkDocument } from '@api/collections/bookmarks/schemas/bookmark.schema';
import { BookmarksService } from '@api/collections/bookmarks/services/bookmarks.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { User } from '@clerk/backend';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { BookmarkSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';

type BookmarkMatchConditions = Record<string, unknown>;

@AutoSwagger()
@Controller('bookmarks')
@ApiBearerAuth()
export class BookmarksController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(private readonly bookmarksService: BookmarksService) {}

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @Body() createBookmarkDto: CreateBookmarkDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const bookmark = await this.bookmarksService.create({
      ...createBookmarkDto,
      brand: createBookmarkDto.brand
        ? String(createBookmarkDto.brand)
        : publicMetadata.brand,
      folder: createBookmarkDto.folder
        ? String(createBookmarkDto.folder)
        : undefined,
      organization: publicMetadata.organization,
      savedAt: new Date(),
      tags: createBookmarkDto.tags?.map((tag) => tag),
      user: publicMetadata.user,
    } as CreateBookmarkDto);

    return serializeSingle(request, BookmarkSerializer, bookmark);
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BookmarksQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    // Build match conditions
    const matchConditions: BookmarkMatchConditions = {
      isDeleted,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    };

    // Filter by category
    if (query.category) {
      matchConditions.category = query.category;
    }

    // Filter by platform
    if (query.platform) {
      matchConditions.platform = query.platform;
    }

    // Filter by intent
    if (query.intent) {
      matchConditions.intent = query.intent;
    }

    // Filter by folder
    if (query.folder) {
      matchConditions.folder = query.folder;
    }

    // Filter by brand
    if (query.brand) {
      matchConditions.brand = query.brand;
    }

    const aggregate: Record<string, unknown>[] = [
      {
        $match: matchConditions as Record<string, unknown>,
      },
      // Add search if provided
      ...(query.search
        ? [
            {
              $match: {
                $or: [
                  { title: { $options: 'i', $regex: query.search } },
                  { content: { $options: 'i', $regex: query.search } },
                  { description: { $options: 'i', $regex: query.search } },
                  { author: { $options: 'i', $regex: query.search } },
                ],
              },
            },
          ]
        : []),
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<BookmarkDocument> =
      await this.bookmarksService.findAll(aggregate, options);
    return serializeCollection(request, BookmarkSerializer, data);
  }

  @Get(':bookmarkId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @Param('bookmarkId') bookmarkId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const bookmark = await this.bookmarksService.findOne({
      _id: bookmarkId,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    if (!bookmark) {
      return returnNotFound(this.constructorName, bookmarkId);
    }

    return serializeSingle(request, BookmarkSerializer, bookmark);
  }

  @Patch(':bookmarkId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @Param('bookmarkId') bookmarkId: string,
    @Body() updateBookmarkDto: UpdateBookmarkDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    // Verify ownership
    const bookmark = await this.bookmarksService.findOne({
      _id: bookmarkId,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    if (!bookmark) {
      return returnNotFound(this.constructorName, bookmarkId);
    }

    // Update the bookmark
    await this.bookmarksService.patch(bookmarkId, {
      ...updateBookmarkDto,
      brand: updateBookmarkDto.brand
        ? String(updateBookmarkDto.brand)
        : undefined,
      folder: updateBookmarkDto.folder
        ? String(updateBookmarkDto.folder)
        : undefined,
      tags: updateBookmarkDto.tags?.map((tag) => tag),
    } as UpdateBookmarkDto);

    // Fetch updated bookmark
    const updated = await this.bookmarksService.findOne({ _id: bookmarkId });

    return serializeSingle(request, BookmarkSerializer, updated);
  }

  @Delete(':bookmarkId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Param('bookmarkId') bookmarkId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse<{ message: string }>> {
    const publicMetadata = getPublicMetadata(user);

    // Verify ownership
    const bookmark = await this.bookmarksService.findOne({
      _id: bookmarkId,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    if (!bookmark) {
      return returnNotFound(this.constructorName, bookmarkId);
    }

    // Soft delete
    await this.bookmarksService.patch(bookmarkId, { isDeleted: true });

    return {
      data: {
        attributes: {
          message: 'Bookmark deleted successfully',
        },
        id: bookmarkId,
        type: 'bookmark',
      },
    };
  }
}
