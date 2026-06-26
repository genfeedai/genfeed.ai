import { Readable } from 'node:stream';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { VideosQueryDto } from '@api/collections/videos/dto/videos-query.dto';
import { VideoGenerationService } from '@api/collections/videos/services/video-generation.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { VotesService } from '@api/collections/votes/services/votes.service';
import type { RequestWithContext as ExpressRequest } from '@api/common/middleware/request-context.middleware';
import { ConfigService } from '@api/config/config.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
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
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  ActivityEntityModel,
  ActivitySource,
  IngredientCategory,
  MemberRole,
  ModelCategory,
} from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { VideoSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  SetMetadata,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

function toPlainRecord(value: unknown): Record<string, unknown> {
  const maybeDocument = value as {
    toObject?: () => Record<string, unknown>;
  };

  if (typeof maybeDocument.toObject === 'function') {
    return maybeDocument.toObject();
  }

  return value as Record<string, unknown>;
}

@AutoSwagger()
@Controller('videos')
@UseGuards(RolesGuard)
export class VideosController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly videosService: VideosService,
    private readonly votesService: VotesService,
    private readonly filesClientService: FilesClientService,
    private readonly metadataService: MetadataService,
    private readonly videoGenerationService: VideoGenerationService,
  ) {}

  @Get('latest')
  @Cache({
    keyGenerator: (req) =>
      `videos:latest:user:${req.user?.id ?? 'anonymous'}:limit:${req.query.limit ?? 10}`,
    tags: ['videos'],
    ttl: 300, // 5 minutes
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findLatest(
    @Req() request: ExpressRequest,
    @CurrentUser() user: User,
    @Query('limit') limit: number = 10,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(false);
    const brand = publicMetadata.brand;

    const aggregate = {
      where: {
        AND: [
          {
            brand,
            category: CategoryPrismaUtil.toIngredientCategory(
              IngredientCategory.VIDEO,
            ),
            isDeleted,
            // Exclude training source videos by default
            training: { not: false },
            user: publicMetadata.user,
          },
        ],
      },
      orderBy: { createdAt: -1 },
    };

    const data = await this.videosService.findAll(aggregate, {
      limit: Math.min(Number(limit) || 10, 50),
      pagination: false,
    });

    return serializeCollection(request, VideoSerializer, data);
  }

  @Get()
  @Cache({
    keyGenerator: (req) =>
      `videos:list:user:${req.user?.id ?? 'anonymous'}:query:${JSON.stringify(req.query)}`,
    tags: ['videos'],
    ttl: 300, // 5 minutes
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: ExpressRequest,
    @CurrentUser() user: User,
    @Query() query: VideosQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);

    // Handle multiple status values (comma-separated)
    const status = QueryDefaultsUtil.parseStatusFilter(query.status);

    //  KEEP COMMENTS FOR NOW
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    // Use CollectionFilterUtil for common filtering patterns
    const scope = CollectionFilterUtil.buildScopeFilter(query.scope);
    const brand = CollectionFilterUtil.buildBrandFilter(
      query.brand,
      publicMetadata,
      'user',
    );

    // Use IngredientFilterUtil to build ingredient-specific filters
    const folderConditions = IngredientFilterUtil.buildFolderFilter(
      query.folder?.toString(),
    );

    const parentConditions = IngredientFilterUtil.buildParentFilter(
      query.parent?.toString(),
    );

    const trainingFilter = IngredientFilterUtil.buildTrainingFilter(
      query.training?.toString(),
    );
    const searchFilter = CollectionFilterUtil.buildSearchFilter(query.search, [
      'metadata.label',
      'metadata.description',
      'prompt.prompt',
    ]);

    // Handle format filter based on metadata dimensions
    // Format is now filtered after metadata lookup

    const aggregate = {
      where: {
        AND: [
          {
            OR: [
              { user: publicMetadata.user },
              {
                organization: publicMetadata.organization,
              },
            ],
          },
          {
            brand,
            category: CategoryPrismaUtil.toIngredientCategory(
              IngredientCategory.VIDEO,
            ),
            isDeleted,
            ...(scope !== undefined ? { scope } : {}),
            status,
            // ...(isEntityId(query.references)
            //   ? { references: query.references }
            //   : {}),
          },
          folderConditions,
          parentConditions,
          trainingFilter,
          searchFilter.where,
        ],
      },
      orderBy: handleQuerySort(query.sort),
    };

    const data = await this.videosService.findAll(aggregate, options);
    return serializeCollection(request, VideoSerializer, data);
  }

  @Get(':videoId')
  @Cache({
    keyGenerator: (req) =>
      `video:${req.params?.videoId ?? 'unknown'}:user:${req.user?.id ?? 'anonymous'}`,
    tags: ['videos'],
    ttl: 900, // 15 minutes
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: ExpressRequest,
    @Param('videoId') videoId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const pipeline = {
      where: {
        _id: videoId,
        isDeleted: false,
        organization: publicMetadata.organization,
      },
    };

    const result = await this.videosService.findAll(pipeline, {
      pagination: false,
    });

    if (!result?.docs || result.docs.length === 0) {
      return returnNotFound(this.constructorName, videoId);
    }

    const data = result.docs[0];

    // Populate relationships that aren't in aggregation
    const populatedData = await this.videosService.findOne({ _id: videoId }, [
      PopulatePatterns.metadataFull,
      PopulatePatterns.promptFull,
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
      PopulatePatterns.organizationMinimal,
      { path: 'captions' },
      { path: 'votes' },
      { path: 'posts' },
    ]);

    if (!populatedData) {
      return returnNotFound(this.constructorName, videoId);
    }

    // Merge evaluation from aggregation into populated data
    // Type assertion needed because aggregation adds 'evaluation' field not in IngredientDocument type
    const evaluation = (data as unknown as Record<string, unknown>).evaluation;
    const mergedData: Record<string, unknown> = {
      ...toPlainRecord(populatedData),
      evaluation,
    };

    const vote = await this.votesService.findOne({
      entity: videoId,
      entityModel: ActivityEntityModel.INGREDIENT,
      isDeleted: false,
      user: publicMetadata.user,
    });

    mergedData.hasVoted = !!vote;

    return serializeSingle(request, VideoSerializer, mergedData);
  }

  @Get(':videoId/thumbnail')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getThumbnail(
    @Param('videoId') videoId: string,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
    @Query('timeInSeconds') timeInSeconds?: number,
    @Query('width') width?: number,
  ): Promise<StreamableFile> {
    const publicMetadata = getPublicMetadata(user);
    const video = await this.videosService.findOne({
      _id: videoId,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!video) {
      throw new HttpException(
        {
          detail: `Video with id ${videoId} not found`,
          title: 'Video not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    try {
      const videoUrl = `${this.configService.ingredientsEndpoint}/videos/${videoId}`;

      const thumbnailUrl = await this.filesClientService.generateThumbnail(
        videoUrl,
        videoId,
        timeInSeconds ? Number(timeInSeconds) : undefined,
        width ? Number(width) : undefined,
      );

      const thumbnailResponse = await fetch(thumbnailUrl);
      if (!thumbnailResponse.ok) {
        throw new HttpException(
          {
            detail: `Failed to download thumbnail from ${thumbnailUrl}`,
            title: 'Failed to download thumbnail',
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const fileStream = Readable.fromWeb(
        thumbnailResponse.body as unknown as import('stream/web').ReadableStream,
      );

      // Set response headers
      // @ts-expect-error TS2339
      res.set({
        'Content-Disposition': `inline; filename="thumbnail-${videoId}.jpg"`,
        'Content-Type': 'image/jpeg',
      });

      return new StreamableFile(fileStream);
    } catch (error: unknown) {
      throw new HttpException(
        {
          detail:
            (error as Error)?.message ||
            'An error occurred while generating the thumbnail',
          title: 'Failed to generate thumbnail',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':videoId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Req() request: ExpressRequest,
    @Param('videoId') videoId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    // Find the video first to ensure it exists and belongs to the user or is part of the same organization
    const video = await this.videosService.findOne({
      _id: videoId,
      OR: [
        { user: publicMetadata.user },
        { organization: publicMetadata.organization },
      ],
      isDeleted: false,
    });

    if (!video) {
      return returnNotFound(this.constructorName, videoId);
    }

    // Only delete if the user owns the video
    const data = await this.videosService.remove(videoId);

    if (data) {
      // Send the ingredient ID, then the function will find the metadat and remove it
      await this.metadataService.remove(videoId);
    }

    return data
      ? serializeSingle(request, VideoSerializer, data)
      : returnNotFound(this.constructorName, videoId);
  }

  @Post()
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
  ])
  @Credits({
    description: 'Video generation',
    source: ActivitySource.VIDEO_GENERATION,
  })
  @DeferCreditsUntilModelResolution()
  @ValidateModel({ category: ModelCategory.VIDEO })
  @UseGuards(SubscriptionGuard, CreditsGuard, ModelsGuard)
  @UseInterceptors(CreditsInterceptor)
  @RateLimit({ limit: 30, scope: 'organization', windowMs: 60 * 1000 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: ExpressRequest,
    @Body() createVideoDto: CreateVideoDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    return this.videoGenerationService.generateVideo(
      user,
      createVideoDto,
      request,
    );
  }
}
