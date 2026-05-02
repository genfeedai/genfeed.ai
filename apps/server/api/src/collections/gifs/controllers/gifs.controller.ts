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
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
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
    const scope = { not: null };
    const brand = publicMetadata.brand;

    const aggregate = {
      where: {
        AND: [
          {
            OR: [
              {
                AND: [
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
                AND: [
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
      orderBy: { createdAt: -1 },
    };

    const data = await this.gifsService.findAll(aggregate, {
      limit: Math.min(Number(limit) || 10, 50),
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

    const aggregate = {
      where: {
        AND: [
          {
            OR: [
              {
                AND: [
                  {
                    OR: [
                      { user: publicMetadata.user },
                      {
                        organization: publicMetadata.organization,
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
                AND: [
                  {
                    category: IngredientCategory.GIF,
                    isDefault: true,
                    isDeleted,
                    status,
                    // Filter default GIFs by brand when brand is specified
                    ...(isEntityId(query.brand) ? { brand } : {}),
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
      orderBy: handleQuerySort(query.sort),
    };

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
