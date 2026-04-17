import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import { MusicQueryDto } from '@api/collections/musics/dto/music-query.dto';
import { UpdateMusicDto } from '@api/collections/musics/dto/update-music.dto';
import {
  Music,
  type MusicDocument,
} from '@api/collections/musics/schemas/music.schema';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import type { User } from '@clerk/backend';
import { IngredientCategory } from '@genfeedai/enums';
import type { JsonApiCollectionResponse } from '@genfeedai/interfaces';
import { MusicSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('musics')
@UseGuards(RolesGuard)
export class MusicsController extends BaseCRUDController<
  MusicDocument,
  CreateMusicDto,
  UpdateMusicDto,
  MusicQueryDto
> {
  constructor(
    readonly loggerService: LoggerService,
    private readonly musicsService: MusicsService,
  ) {
    super(loggerService, musicsService, MusicSerializer, 'Music', [
      'metadata',
      'brand',
    ]);
  }

  /**
   * Override buildFindAllPipeline to add music-specific filtering
   */
  public buildFindAllPipeline(
    user: User,
    query: MusicQueryDto,
  ): Record<string, unknown>[] {
    const publicMetadata = getPublicMetadata(user);

    // Use CollectionFilterUtil for common filtering patterns
    const brand = CollectionFilterUtil.buildBrandFilter(
      query.brand,
      publicMetadata,
      'user',
    );

    const isDefault = CollectionFilterUtil.buildBooleanFilter(query.isDefault, {
      $ne: null,
    });

    const scope = CollectionFilterUtil.buildScopeFilter(query.scope);

    const status = QueryDefaultsUtil.parseMusicStatusFilter(query.status);

    // Format and provider filters will be applied after metadata lookup
    const hasMetadataFilters = query.format || query.provider;

    return [
      {
        $match: {
          $or: [
            {
              brand,
              category: IngredientCategory.MUSIC,
              isDeleted: query.isDeleted ?? false,
              status,
              user: publicMetadata.user,
            },
            {
              category: IngredientCategory.MUSIC,
              isDefault,
              isDeleted: query.isDeleted ?? false,
              scope,
              status,
              // Filter default musics by brand when brand is specified
              ...(query.brand && this.isValidObjectId(query.brand)
                ? { brand }
                : {}),
            },
          ],
        },
      },
      // Always include metadata lookup to get prompt information
      {
        $lookup: {
          as: 'metadata',
          foreignField: '_id',
          from: 'metadata',
          localField: 'metadata',
        },
      },
      {
        $unwind: {
          path: '$metadata',
          preserveNullAndEmptyArrays: true,
        },
      },
      // Add prompt lookup to get prompt information
      {
        $lookup: {
          as: 'prompt',
          foreignField: '_id',
          from: 'prompts',
          localField: 'metadata.prompt',
        },
      },
      {
        $unwind: {
          path: '$prompt',
          preserveNullAndEmptyArrays: true,
        },
      },
      // Apply metadata filters if specified
      ...(hasMetadataFilters
        ? [
            {
              $match: {
                ...(query.format ? { 'metadata.format': query.format } : {}),
                ...(query.provider
                  ? { 'metadata.provider': query.provider }
                  : {}),
              },
            },
          ]
        : []),
      // Apply search filter if specified
      ...(query.search
        ? [
            {
              $match: {
                $or: [
                  {
                    'metadata.label': {
                      $options: 'i',
                      $regex: query.search,
                    },
                  },
                  {
                    'metadata.description': {
                      $options: 'i',
                      $regex: query.search,
                    },
                  },
                  {
                    'prompt.original': {
                      $options: 'i',
                      $regex: query.search,
                    },
                  },
                ],
              },
            },
          ]
        : []),
      {
        $sort: query.sort ? handleQuerySort(query.sort) : { createdAt: -1 },
      },
    ];
  }

  private isValidObjectId(id: string): boolean {
    return /^[0-9a-f]{24}$/i.test(id);
  }

  @Get('latest')
  @Cache({
    keyGenerator: (req) =>
      `musics:latest:user:${req.user?.id ?? 'anonymous'}:limit:${req.query.limit ?? 10}`,
    tags: ['musics'],
    ttl: 300, // 5 minutes
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findLatest(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query('limit') limit: number = 10,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(false);
    const scope = { $ne: null };
    const brand = publicMetadata.brand;

    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          $or: [
            {
              brand,
              category: IngredientCategory.MUSIC,
              isDeleted,
              // Exclude training source musics by default
              training: { $exists: false },
              user: publicMetadata.user,
            },
            {
              // Filter default musics by brand when brand is specified
              brand,
              category: IngredientCategory.MUSIC,
              isDefault: true,
              isDeleted,
              scope,
            },
          ],
        },
      },
      {
        $lookup: {
          as: 'metadata',
          foreignField: '_id',
          from: 'metadata',
          localField: 'metadata',
        },
      },
      {
        $unwind: {
          path: '$metadata',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          as: 'prompt',
          foreignField: '_id',
          from: 'prompts',
          localField: 'prompt',
        },
      },
      {
        $unwind: {
          path: '$prompt',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $limit: Math.min(limit, 50), // Cap at 50 for performance
      },
    ];

    const data: AggregatePaginateResult<MusicDocument> =
      await this.musicsService.findAll(aggregate, {
        pagination: false,
      });

    return serializeCollection(request, this.serializer, data);
  }
}
