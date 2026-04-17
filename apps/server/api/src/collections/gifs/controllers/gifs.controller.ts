import { GifsQueryDto } from '@api/collections/gifs/dto/gifs-query.dto';
import { GifsService } from '@api/collections/gifs/services/gifs.service';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { User } from '@clerk/backend';
import { ActivityEntityModel, IngredientCategory } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';

const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_REGEX.test(id);
}

@AutoSwagger()
@Controller('gifs')
@UseInterceptors(CreditsInterceptor)
@UseGuards(RolesGuard)
export class GifsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly gifsService: GifsService,
    private readonly loggerService: LoggerService,
    private readonly votesService: VotesService,
  ) {}

  @Get('latest')
  @Cache({
    keyGenerator: (req) =>
      `gifs:latest:user:${req.user?.id ?? 'anonymous'}:limit:${req.query.limit ?? 10}`,
    tags: ['gifs'],
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
          $and: [
            {
              $or: [
                {
                  $and: [
                    {
                      brand,
                      category: IngredientCategory.GIF,
                      isDeleted,
                      scope,
                      user: publicMetadata.user,
                    },
                  ],
                },
                {
                  $and: [
                    {
                      // Filter default GIFs by brand when brand is specified
                      brand,
                      category: IngredientCategory.GIF,
                      isDefault: true,
                      isDeleted,
                      scope,
                    },
                  ],
                },
              ],
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

    const data = await this.gifsService.findAll(aggregate, {
      pagination: false,
    });

    return serializeCollection(request, IngredientSerializer, data);
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: GifsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { query });

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);

    // Handle multiple status values (comma-separated)
    const status = QueryDefaultsUtil.parseStatusFilter(query.status);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    // Use CollectionFilterUtil for common filtering patterns
    const scope = CollectionFilterUtil.buildScopeFilter(query.scope);
    const brand = CollectionFilterUtil.buildBrandFilter(
      query.brand,
      publicMetadata,
      'exists',
    );

    // Use IngredientFilterUtil to build ingredient-specific filters
    const parentConditions = IngredientFilterUtil.buildParentFilter(
      query.parent,
    );

    const folderConditions = IngredientFilterUtil.buildFolderFilter(
      query.folder,
    );

    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          $and: [
            {
              $or: [
                {
                  $and: [
                    {
                      $or: [
                        { user: publicMetadata.user },
                        {
                          organization: 
                            publicMetadata.organization,
                          ,
                        },
                      ],
                      brand,
                      category: IngredientCategory.GIF,
                      isDeleted,
                      scope,
                      status,
                    },
                    folderConditions,
                    ...(Object.keys(parentConditions).length > 0
                      ? [parentConditions]
                      : []),
                  ],
                },
                {
                  $and: [
                    {
                      category: IngredientCategory.GIF,
                      isDefault: true,
                      isDeleted,
                      status,
                      // Filter default GIFs by brand when brand is specified
                      ...(isValidObjectId(query.brand) ? { brand } : {}),
                    },
                    folderConditions,
                    ...(Object.keys(parentConditions).length > 0
                      ? [parentConditions]
                      : []),
                  ],
                },
              ],
            },
          ],
        },
      },
      ...IngredientFilterUtil.buildMetadataLookup(),
      ...IngredientFilterUtil.buildFormatFilterStage(query.format),
      ...IngredientFilterUtil.buildPromptLookup(query.lightweight),
      {
        $lookup: {
          as: 'brand',
          foreignField: '_id',
          from: 'brands',
          localField: 'brand',
        },
      },
      {
        $unwind: {
          path: '$brand',
          preserveNullAndEmptyArrays: true,
        },
      },
      // Skip expensive lookups in lightweight mode (for gallery views)
      ...(query.lightweight
        ? [
            // Only include minimal brand data
            {
              $project: {
                'brand._id': 1,
                'brand.label': 1,
                'brand.slug': 1,
                createdAt: 1,
              },
            },
          ]
        : [
            // Full lookups for detailed views
            {
              $lookup: {
                as: 'brandLogo',
                from: 'assets',
                let: { brandId: '$brand._id' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$parent', '$$brandId'] },
                          { $eq: ['$category', 'logo'] },
                          { $eq: ['$isDeleted', false] },
                        ],
                      },
                    },
                  },
                ],
              },
            },
            {
              $unwind: {
                path: '$brandLogo',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $addFields: { 'brand.logo': '$brandLogo._id' },
            },
            {
              $project: { brandLogo: 0 },
            },
            {
              $lookup: {
                as: 'children',
                from: 'ingredients',
                let: { parentId: '$_id' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$parent', '$$parentId'] },
                          { $eq: ['$isDeleted', false] },
                        ],
                      },
                    },
                  },
                ],
              },
            },
            {
              $addFields: { totalChildren: { $size: '$children' } },
            },
            {
              $project: { children: 0 },
            },
            {
              $lookup: {
                as: 'totalVotes',
                from: 'votes',
                let: { entityId: '$_id' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$entity', '$$entityId'] },
                          { $eq: ['$isDeleted', false] },
                        ],
                      },
                    },
                  },
                ],
              },
            },
            {
              $addFields: {
                totalVotes: { $size: '$totalVotes' },
              },
            },
            {
              $lookup: {
                as: 'hasVoted',
                from: 'votes',
                let: { entityId: '$_id' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          {
                            $eq: [
                              '$entityModel',
                              ActivityEntityModel.INGREDIENT,
                            ],
                          },
                          { $eq: ['$entity', '$$entityId'] },
                          { $eq: ['$isDeleted', false] },
                          {
                            $eq: [
                              '$user',
                              publicMetadata.user,
                            ],
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            },
            {
              $addFields: {
                hasVoted: { $gt: [{ $size: '$hasVoted' }, 0] },
              },
            },
          ]),
      // Add text search if search query is provided
      ...(query.search
        ? [
            {
              $match: {
                $or: [
                  { 'metadata.label': { $options: 'i', $regex: query.search } },
                  {
                    'metadata.description': {
                      $options: 'i',
                      $regex: query.search,
                    },
                  },
                ],
              },
            },
          ]
        : []),
      // Always populate tags (lightweight - just tag IDs)
      {
        $lookup: {
          as: 'tags',
          foreignField: '_id',
          from: 'tags',
          localField: 'tags',
          pipeline: query.lightweight
            ? [
                {
                  $project: {
                    _id: 1,
                    label: 1,
                  },
                },
              ]
            : [],
        },
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data = await this.gifsService.findAll(aggregate, options);
    return serializeCollection(request, IngredientSerializer, data);
  }

  @Get(':gifId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @Param('gifId') gifId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const data = await this.gifsService.findOne({ _id: gifId }, [
      PopulatePatterns.metadataFull,
      PopulatePatterns.promptFull,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
      PopulatePatterns.organizationMinimal,
    ]);

    if (!data) {
      return returnNotFound(this.constructorName, gifId);
    }

    const vote = await this.votesService.findOne({
      entity: gifId,
      entityModel: ActivityEntityModel.INGREDIENT,
      user: publicMetadata.user,
    });

    data.hasVoted = !!vote;

    return serializeSingle(request, IngredientSerializer, data);
  }

  @Delete(':gifId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Req() request: Request,
    @Param('gifId') gifId: string,
  ): Promise<JsonApiSingleResponse> {
    const data = await this.gifsService.remove(gifId);
    return data
      ? serializeSingle(request, IngredientSerializer, data)
      : returnNotFound(this.constructorName, gifId);
  }
}
