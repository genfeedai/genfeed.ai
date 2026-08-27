/**
 * Videos Relationships Controller
 * Handles video relationship operations:
 * - Get video children (derived videos)
 * - Get video posts (published instances)
 */

import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { JsonApiCollectionResponse } from '@genfeedai/interfaces';
import { PostSerializer, VideoSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { type IngredientDocument } from '@server/collections/ingredients/schemas/ingredient.schema';
import { type PostDocument } from '@server/collections/posts/post.schema';
import { PostsService } from '@server/collections/posts/services/posts.service';
import { VideosQueryDto } from '@server/collections/videos/dto/videos-query.dto';
import { VideosService } from '@server/collections/videos/services/videos.service';
import { LogMethod } from '@server/helpers/decorators/log/log-method.decorator';
import { customLabels } from '@server/helpers/utils/pagination.util';
import { AggregatePaginateResult } from '@server/types/aggregate-paginate-result';
import type { Request } from 'express';

@AutoSwagger()
@Controller('videos')
@UseGuards(RolesGuard)
export class VideosRelationshipsController {
  constructor(
    readonly loggerService: LoggerService,
    private readonly postsService: PostsService,
    private readonly videosService: VideosService,
  ) {}

  @Get(':videoId/children')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findChildren(
    @Req() request: Request,
    @Param('videoId') videoId: string,
    @Query() query: VideosQueryDto,
  ) {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate = {
      where: {
        isDeleted,
        parentId: videoId,
      },
      orderBy: handleQuerySort(query.sort),
    };

    const data: AggregatePaginateResult<IngredientDocument> =
      await this.videosService.findAll(aggregate, options);
    return serializeCollection(request, VideoSerializer, data);
  }

  @Get(':videoId/posts')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllPosts(
    @Req() request: Request,
    @Param('videoId') videoId: string,
    @CurrentUser() user: User,
    @Query() query: VideosQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate = {
      where: {
        ingredients: { some: { id: videoId } },
        isDeleted,
        organizationId: user.organizationId,
        userId: user.userId ?? user.id,
      },
      orderBy: handleQuerySort(query.sort),
    };

    const data: AggregatePaginateResult<PostDocument> =
      await this.postsService.findAll(aggregate, options);
    return serializeCollection(request, PostSerializer, data);
  }
}
