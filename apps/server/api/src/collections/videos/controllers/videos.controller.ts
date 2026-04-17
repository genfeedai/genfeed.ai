import { Readable } from 'node:stream';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BookmarksService } from '@api/collections/bookmarks/services/bookmarks.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { VideosQueryDto } from '@api/collections/videos/dto/videos-query.dto';
import { VideoMusicOrchestrationService } from '@api/collections/videos/services/video-music-orchestration.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { VotesService } from '@api/collections/votes/services/votes.service';
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
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import {
  isImageToVideoRequest,
  resolveGenerationDefaultModel,
} from '@api/helpers/utils/generation-defaults/generation-defaults.util';
import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { buildReferenceImageUrls } from '@api/helpers/utils/reference/reference.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { KlingAIService } from '@api/services/integrations/klingai/klingai.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { PollingService } from '@api/shared/services/polling/polling.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { User } from '@clerk/backend';
import { MODEL_KEYS, MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
  MemberRole,
  MetadataExtension,
  ModelCategory,
  PricingType,
  PromptCategory,
  PromptStatus,
} from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { VideoSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
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
import type { Request as ExpressRequest } from 'express';

type PromptInput = Record<string, unknown> & {
  prompt?: string;
  resolution?: string;
};

@AutoSwagger()
@Controller('videos')
@UseGuards(RolesGuard)
export class VideosController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly activitiesService: ActivitiesService,
    private readonly brandsService: BrandsService,
    private readonly assetsService: AssetsService,
    private readonly filesClientService: FilesClientService,
    private readonly bookmarksService: BookmarksService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly falService: FalService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly ingredientsService: IngredientsService,
    private readonly pollingService: PollingService,
    private readonly klingAIService: KlingAIService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly modelRegistrationService: ModelRegistrationService,
    private readonly modelsService: ModelsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly promptsService: PromptsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly sharedService: SharedService,
    private readonly videoMusicOrchestrationService: VideoMusicOrchestrationService,
    private readonly videosService: VideosService,
    private readonly votesService: VotesService,
    private readonly cacheService: CacheService,
    private readonly routerService: RouterService,
    private readonly websocketService: NotificationsPublisherService,
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
    const scope = { $ne: null };
    const brand = publicMetadata.brand;

    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          $and: [
            {
              brand,
              category: IngredientCategory.VIDEO,
              isDeleted,
              scope,
              // Exclude training source videos by default
              training: { $exists: false },
              user: publicMetadata.user,
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

    const data = await this.videosService.findAll(aggregate, {
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

    // Handle format filter based on metadata dimensions
    // Format is now filtered after metadata lookup using $expr

    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          $and: [
            {
              $or: [
                { user: publicMetadata.user },
                {
                  organization: publicMetadata.organization,
                },
              ],
            },
            {
              brand,
              category: IngredientCategory.VIDEO,
              isDeleted,
              scope,
              status,
              // ...(isValidObjectId(query.references)
              //   ? { references: query.references }
              //   : {}),
            },
            folderConditions,
            parentConditions,
            trainingFilter,
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
                    { $eq: ['$entityModel', ActivityEntityModel.INGREDIENT] },
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
                    { $eq: ['$entityModel', ActivityEntityModel.INGREDIENT] },
                    { $eq: ['$entity', '$$entityId'] },
                    { $eq: ['$isDeleted', false] },
                    { $eq: ['$user', publicMetadata.user] },
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
      {
        $lookup: {
          as: 'tags',
          foreignField: '_id',
          from: 'tags',
          localField: 'tags',
        },
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

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

    // Build aggregation pipeline to fetch video with evaluation
    const pipeline: Record<string, unknown>[] = [
      {
        $match: {
          _id: videoId,
          isDeleted: false,
          organization: publicMetadata.organization,
        },
      },
      // Lookup latest COMPLETED evaluation for this video (full document)
      {
        $lookup: {
          as: 'evaluation',
          from: 'evaluations',
          let: { videoId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$content', '$$videoId'] },
                contentType: IngredientCategory.VIDEO,
                isDeleted: false,
                status: 'COMPLETED',
              },
            },
            { $sort: { updatedAt: -1 } },
            { $limit: 1 },
            // NO $project - include full evaluation document
          ],
        },
      },
      // Flatten evaluation to single object (or null)
      {
        $addFields: {
          evaluation: {
            $ifNull: [{ $arrayElemAt: ['$evaluation', 0] }, null],
          },
        },
      },
    ];

    // Execute aggregation using service method
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
    const mergedData = {
      ...(populatedData.toObject ? populatedData.toObject() : populatedData),
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
      $or: [
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
    const publicMetadata = getPublicMetadata(user);

    if (!createVideoDto.prompt && !createVideoDto.text) {
      throw new HttpException(
        {
          detail: 'Prompt is required',
          title: 'Prompt validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const brandId = createVideoDto.brand || publicMetadata.brand;

    const brand = await this.brandsService.findOne({
      _id: brandId,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!brand) {
      throw new HttpException(
        {
          detail: 'You do not have access to this brand',
          title: 'Brand not found',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        isDeleted: false,
        organization: publicMetadata.organization,
      },
    );

    const referenceIds: string[] = Array.isArray(createVideoDto.references)
      ? createVideoDto.references.map((id) => id.toString())
      : [];

    // Model selection: auto-select > user-provided > brand default > system default
    let model: string;
    let routerReason: string | undefined;

    if (createVideoDto.autoSelectModel) {
      // Auto model routing - let RouterService pick the best model
      const recommendation = await this.routerService.selectModel({
        category: ModelCategory.VIDEO,
        dimensions: {
          height: createVideoDto.height,
          width: createVideoDto.width,
        },
        duration: createVideoDto.duration,
        prioritize: createVideoDto.prioritize || 'balanced',
        prompt: createVideoDto.text || '',
        speech: createVideoDto.speech,
      });
      model = recommendation.selectedModel as string;
      routerReason = recommendation.reason;

      this.loggerService.log('Auto model routing selected', routerReason);
    } else {
      // Manual selection: user-provided > brand default > system default
      model = resolveGenerationDefaultModel<string>({
        brandDefault: (isImageToVideoRequest({
          endFrame: createVideoDto.endFrame,
          references: referenceIds,
        })
          ? brand.defaultImageToVideoModel
          : brand.defaultVideoModel) as string | undefined,
        explicit: createVideoDto.model as string | undefined,
        organizationDefault: (isImageToVideoRequest({
          endFrame: createVideoDto.endFrame,
          references: referenceIds,
        })
          ? organizationSettings?.defaultImageToVideoModel
          : organizationSettings?.defaultVideoModel) as string | undefined,
        systemDefault: (await this.routerService.getDefaultModel(
          ModelCategory.VIDEO,
        )) as string,
      });
    }

    // Validate resolved model against org (catches default-resolution bypassing ModelsGuard)
    if (request.context?.organizationId) {
      const authenticatedOrgId = request.context.organizationId;
      await this.modelRegistrationService.validateModelForOrg(
        model,
        authenticatedOrgId,
      );
    }

    // CreditsGuard deferred credit check, do it now with resolved model.
    const reqWithCredits = request as unknown as {
      creditsConfig?: {
        deferred?: boolean;
        amount?: number;
        modelKey?: string;
      };
    };
    if (reqWithCredits.creditsConfig?.deferred) {
      const resolvedModelDoc = await this.modelsService.findOne({
        isDeleted: false,
        key: baseModelKey(model),
      });

      const vidWidth = createVideoDto.width || 1920;
      const vidHeight = createVideoDto.height || 1080;
      const vidDuration = createVideoDto.duration || 0;
      let requiredCredits: number;

      if (resolvedModelDoc) {
        requiredCredits = this.calculateDynamicVideoCost(
          resolvedModelDoc,
          vidWidth,
          vidHeight,
          vidDuration,
        );
      } else {
        requiredCredits = 5; // Fallback default cost
      }

      const hasCredits =
        await this.creditsUtilsService.checkOrganizationCreditsAvailable(
          publicMetadata.organization,
          requiredCredits,
        );
      if (!hasCredits) {
        const balance =
          await this.creditsUtilsService.getOrganizationCreditsBalance(
            publicMetadata.organization,
          );
        throw new HttpException(
          {
            detail: `Insufficient credits: ${requiredCredits} required, ${balance} available`,
            title: 'Insufficient credits',
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      reqWithCredits.creditsConfig = {
        ...reqWithCredits.creditsConfig,
        amount: requiredCredits,
        deferred: false,
        modelKey: model,
      };
    }

    const brandPromptBranding = buildPromptBrandingFromBrand(brand);

    const width = createVideoDto.width || 1920;
    const height = createVideoDto.height || 1080;

    let promptText: string = createVideoDto.text || '';

    const referenceImageUrls: string[] = await buildReferenceImageUrls({
      assetsService: this.assetsService,
      configService: this.configService,
      ingredientsService: this.ingredientsService,
      loggerService: this.loggerService,
      referenceIds,
    });

    // Build endFrame URL for video interpolation
    let endFrameUrl: string | undefined;
    if (createVideoDto.endFrame) {
      const endFrameUrls = await buildReferenceImageUrls({
        assetsService: this.assetsService,
        configService: this.configService,
        ingredientsService: this.ingredientsService,
        loggerService: this.loggerService,
        referenceIds: [createVideoDto.endFrame],
      });
      endFrameUrl = endFrameUrls[0];
    }

    if (createVideoDto.prompt) {
      const prompt = await this.promptsService.findOne({
        _id: createVideoDto.prompt.toString(),
        isDeleted: false,
      });

      if (prompt?._id) {
        promptText = prompt?.enhanced || prompt?.original || '';
      }
    }

    // First build prompt to get template info
    const {
      input: promptParams,
      templateUsed,
      templateVersion,
    } = await this.promptBuilderService.buildPrompt(
      model,
      {
        audioUrl: createVideoDto.audioUrl,
        blacklist: createVideoDto.blacklist,
        brand: {
          description: brand.description,
          label: brand.label,
          primaryColor: brand.primaryColor,
          secondaryColor: brand.secondaryColor,
          text: brand.text,
        },
        branding: brandPromptBranding,
        brandingMode: createVideoDto.brandingMode,
        camera: createVideoDto.camera,
        cameraMovement: createVideoDto.cameraMovement,
        duration: createVideoDto.duration,
        endFrame: endFrameUrl,
        fontFamily: createVideoDto.fontFamily,
        height,
        isAudioEnabled: createVideoDto.isAudioEnabled,
        isBrandingEnabled: createVideoDto.isBrandingEnabled,
        lens: createVideoDto.lens,
        lighting: createVideoDto.lighting,
        // Use model's category from DB (set by ModelsGuard), fallback to VIDEO
        modelCategory:
          ((request as unknown as { selectedModel?: { category?: string } })
            .selectedModel?.category as ModelCategory) || ModelCategory.VIDEO,
        mood: createVideoDto.mood,
        outputs: createVideoDto.outputs,
        prompt: promptText,
        promptTemplate: createVideoDto.promptTemplate,
        references: referenceImageUrls,
        resolution: createVideoDto.resolution,
        scene: createVideoDto.scene,
        seed: createVideoDto.seed,
        sounds: createVideoDto.sounds,
        speech: createVideoDto.speech,
        style: createVideoDto.style,
        tags: createVideoDto.tags?.map((tag) => tag.toString()),
        useTemplate: createVideoDto.useTemplate,
        width,
      },
      publicMetadata.organization,
    );
    const promptInput = promptParams as PromptInput;

    const promptData = await this.promptsService.create(
      new PromptEntity({
        blacklists: createVideoDto.blacklist,
        brand: publicMetadata.brand,
        camera: createVideoDto.camera,
        category: PromptCategory.MODELS_PROMPT_VIDEO,
        mood: createVideoDto.mood,
        organization: publicMetadata.organization,
        original: promptText,
        scene: createVideoDto.scene,
        sounds: createVideoDto.sounds,
        speech: createVideoDto.speech,
        status: PromptStatus.PROCESSING,
        style: createVideoDto.style,
        user: publicMetadata.user,
      }),
    );

    const { metadataData, ingredientData } =
      await this.sharedService.saveDocuments(user, {
        ...createVideoDto,
        bookmark: createVideoDto.bookmark
          ? (createVideoDto.bookmark as string)
          : undefined,
        brand: brand._id,
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        height,
        model,
        organization: brand.organization,
        prompt: promptData._id,

        // Template tracking
        promptTemplate: templateUsed,
        references:
          referenceIds.length > 0 ? referenceIds.map((id) => id) : undefined,
        status: IngredientStatus.PROCESSING,
        style: createVideoDto.style === '' ? null : createVideoDto.style,
        templateVersion: templateVersion,
        width,
      });

    // Create activity for video generation start
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: brand._id,
        entityId: ingredientData._id,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.VIDEO_PROCESSING,
        organization: publicMetadata.organization,
        source: ActivitySource.VIDEO_GENERATION,
        user: publicMetadata.user,
        value: JSON.stringify({
          ingredientId: ingredientData._id.toString(),
          model,
          type: 'generation',
        }),
      }),
    );

    // Emit background-task-update WebSocket event for activities dropdown
    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity._id.toString(),
      label: 'Video Generation',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: ingredientData._id.toString(),
      userId: user.id,
    });

    const websocketUrl = WebSocketPaths.video(ingredientData._id);
    const outputs = createVideoDto.outputs || 1;

    this.loggerService.debug('Video generation request received', {
      model,
      outputs,
      rawOutputs: createVideoDto.outputs,
    });

    // Track all placeholder ingredient IDs
    const pendingIngredientIds: string[] = [ingredientData._id.toString()];

    try {
      // When generation is triggered, deduct credits
      let generationId: string | null;

      switch (model) {
        case MODEL_KEYS.KLINGAI_V2:
          // KlingAI uses its own service for queue management
          generationId = await this.klingAIService.queueGenerateTextToVideo(
            promptInput.prompt || '',
            { height, model, width },
          );
          break;

        case MODEL_KEYS.FAL_SEEDANCE_2_0:
        case MODEL_KEYS.FAL_KLING_VIDEO:
        case MODEL_KEYS.FAL_LUMA_DREAM_MACHINE:
        case MODEL_KEYS.FAL_RUNWAY_GEN3:
        case MODEL_KEYS.FAL_STABLE_VIDEO: {
          const falResult = await this.falService.generateVideo(model, {
            prompt: promptInput.prompt || '',
            ...(createVideoDto.duration && {
              duration: createVideoDto.duration,
            }),
            ...(referenceImageUrls[0] && {
              image_url: referenceImageUrls[0],
            }),
          });
          generationId = falResult.url;
          break;
        }

        default:
          // All Replicate-based models (Google VEO, Imagen, Luma, Sora, etc.)
          generationId = await this.replicateService.generateTextToVideo(
            model,
            promptParams,
          );
          break;
      }

      if (generationId) {
        // Deduct credits after successful generation trigger
        // Credits were already verified by CreditsGuard before processing started
        const modelData = await this.modelsService.findOne({ key: model });
        let creditsToDeduct = modelData?.cost || 0;

        // Multiply credits by resolution multiplier (high/1080p = 2x, standard/720p = 1x)
        if (
          promptInput.resolution === 'high' ||
          promptInput.resolution === '1080p'
        ) {
          creditsToDeduct *= 2;
        }

        // Multiply credits by outputs for multi-output requests
        if (outputs > 1) {
          creditsToDeduct *= outputs;
        }

        if (creditsToDeduct > 0) {
          // Build description with resolution and outputs info
          let resolutionText = '';
          if (
            promptInput.resolution === 'high' ||
            promptInput.resolution === '1080p'
          ) {
            resolutionText = ' (high resolution)';
          } else if (
            promptInput.resolution === 'standard' ||
            promptInput.resolution === '720p'
          ) {
            resolutionText = ' (standard resolution)';
          }
          const outputsText = outputs > 1 ? ` (${outputs} outputs)` : '';
          const description = `Video generation - ${model}${resolutionText}${outputsText}`;

          await this.creditsUtilsService.deductCreditsFromOrganization(
            publicMetadata.organization,
            publicMetadata.user,
            creditsToDeduct,
            description,
            ActivitySource.VIDEO_GENERATION,
          );

          this.loggerService.log(
            'Credits deducted after video generation triggered',
            {
              credits: creditsToDeduct,
              generationId,
              model,
              organizationId: publicMetadata.organization,
              outputs,
              resolution: promptInput.resolution || undefined,
              userId: publicMetadata.user,
            },
          );
        }

        // Check if model supports batch generation (single API call with multiple outputs)
        const modelCapability = MODEL_OUTPUT_CAPABILITIES[model];
        const isBatchSupported = modelCapability?.isBatchSupported ?? false;

        // Handle multiple outputs differently for batch-capable models vs others
        if (isBatchSupported && outputs > 1) {
          // Batch-capable models (trained models): single API call with multiple outputs, multiple results in one generation
          // First output uses indexed externalId
          await this.metadataService.patch(
            metadataData._id,
            new MetadataEntity({
              externalId: `${generationId}_0`,
            }),
          );

          // Create additional placeholder documents for remaining outputs
          // PERFORMANCE: Create documents in parallel for better performance
          const additionalDocuments = await Promise.all(
            Array.from({ length: outputs - 1 }, () => {
              return this.sharedService.saveDocuments(user, {
                ...createVideoDto,
                brand: brand._id,
                category: IngredientCategory.VIDEO,
                extension: MetadataExtension.MP4,
                height,
                model,
                organization: brand.organization,
                prompt: promptData._id,
                references:
                  referenceIds.length > 0
                    ? referenceIds.map((id) => id)
                    : undefined,
                status: IngredientStatus.PROCESSING,
                style:
                  createVideoDto.style === '' ? null : createVideoDto.style,
                width,
              });
            }),
          );

          // Update metadata and videos in parallel
          await Promise.all(
            additionalDocuments.flatMap(
              ({ metadataData, ingredientData }, index) => {
                const i = index + 1;
                return [
                  this.metadataService.patch(
                    metadataData._id,
                    new MetadataEntity({
                      externalId: `${generationId}_${i}`,
                    }),
                  ),
                  this.videosService.patch(ingredientData._id, {
                    prompt: promptData._id,
                  }),
                ];
              },
            ),
          );

          // Add all ingredient IDs to pending list
          pendingIngredientIds.push(
            ...additionalDocuments.map(({ ingredientData }) =>
              ingredientData._id.toString(),
            ),
          );

          // Create activities for each additional placeholder (batch model path)
          await Promise.all(
            additionalDocuments.map(({ ingredientData: addIngredient }) =>
              this.activitiesService
                .create(
                  new ActivityEntity({
                    brand: brand._id,
                    entityId: addIngredient._id,
                    entityModel: ActivityEntityModel.INGREDIENT,
                    key: ActivityKey.VIDEO_PROCESSING,
                    organization: 
                      publicMetadata.organization,
                    ,
                    source: ActivitySource.VIDEO_GENERATION,
                    user: publicMetadata.user,
                    value: JSON.stringify({
                      ingredientId: addIngredient._id.toString(),
                      model,
                      type: 'generation',
                    }),
                  }),
                )
                .then((newActivity) =>
                  this.websocketService.publishBackgroundTaskUpdate({
                    activityId: newActivity._id.toString(),
                    label: 'Video Generation',
                    progress: 0,
                    room: getUserRoomName(user.id),
                    status: 'processing',
                    taskId: addIngredient._id.toString(),
                    userId: user.id,
                  }),
                ),
            ),
          );

          this.loggerService.log(
            'Created multiple placeholders for batch-capable model multi-output',
            {
              generationId,
              isBatchSupported: true,
              model,
              outputs,
              pendingIngredientIds,
            },
          );
        } else if (outputs > 1) {
          // Non-batch models (VEO, Sora, KlingAI, etc.): make multiple separate API calls
          await this.metadataService.patch(
            metadataData._id,
            new MetadataEntity({
              externalId: generationId,
            }),
          );

          // Make additional API calls for remaining outputs
          // NOTE: This loop must remain sequential because each iteration needs
          // a unique generationId from the external API call
          for (let i = 1; i < outputs; i++) {
            const {
              metadataData: additionalMetadata,
              ingredientData: additionalIngredient,
            } = await this.sharedService.saveDocuments(user, {
              ...createVideoDto,
              brand: brand._id,
              category: IngredientCategory.VIDEO,
              extension: MetadataExtension.MP4,
              height,
              model,
              organization: brand.organization,
              prompt: promptData._id,
              references:
                referenceIds.length > 0
                  ? referenceIds.map((id) => id)
                  : undefined,
              status: IngredientStatus.PROCESSING,
              style: createVideoDto.style === '' ? null : createVideoDto.style,
              width,
            });

            // Make separate API call for each output based on model
            let additionalGenerationId: string | null = null;

            switch (model) {
              case MODEL_KEYS.KLINGAI_V2:
                additionalGenerationId =
                  await this.klingAIService.queueGenerateTextToVideo(
                    promptInput.prompt || '',
                    { height, model, width },
                  );
                break;

              case MODEL_KEYS.FAL_SEEDANCE_2_0:
              case MODEL_KEYS.FAL_KLING_VIDEO:
              case MODEL_KEYS.FAL_LUMA_DREAM_MACHINE:
              case MODEL_KEYS.FAL_RUNWAY_GEN3:
              case MODEL_KEYS.FAL_STABLE_VIDEO: {
                const falResult = await this.falService.generateVideo(model, {
                  prompt: promptInput.prompt || '',
                  ...(createVideoDto.duration && {
                    duration: createVideoDto.duration,
                  }),
                  ...(referenceImageUrls[0] && {
                    image_url: referenceImageUrls[0],
                  }),
                });
                additionalGenerationId = falResult.url;
                break;
              }

              default:
                // All other Replicate-based models (Google VEO, Sora, etc.)
                additionalGenerationId =
                  await this.replicateService.generateTextToVideo(
                    model,
                    promptParams,
                  );
                break;
            }

            // Parallelize the patch operations
            await Promise.all([
              this.metadataService.patch(
                additionalMetadata._id,
                new MetadataEntity({
                  externalId: additionalGenerationId || '',
                }),
              ),
              this.videosService.patch(additionalIngredient._id, {
                prompt: promptData._id,
              }),
            ]);

            pendingIngredientIds.push(additionalIngredient._id.toString());

            // Create activity for this additional output (non-batch path)
            const additionalActivity = await this.activitiesService.create(
              new ActivityEntity({
                brand: brand._id,
                entityId: additionalIngredient._id,
                entityModel: ActivityEntityModel.INGREDIENT,
                key: ActivityKey.VIDEO_PROCESSING,
                organization: publicMetadata.organization,
                source: ActivitySource.VIDEO_GENERATION,
                user: publicMetadata.user,
                value: JSON.stringify({
                  ingredientId: additionalIngredient._id.toString(),
                  model,
                  type: 'generation',
                }),
              }),
            );

            await this.websocketService.publishBackgroundTaskUpdate({
              activityId: additionalActivity._id.toString(),
              label: 'Video Generation',
              progress: 0,
              room: getUserRoomName(user.id),
              status: 'processing',
              taskId: additionalIngredient._id.toString(),
              userId: user.id,
            });
          }

          this.loggerService.log(
            'Created multiple API calls for non-batch model multi-output',
            {
              isBatchSupported: false,
              model,
              outputs,
              pendingIngredientIds,
            },
          );
        } else {
          // Single output - use original external ID
          await this.metadataService.patch(
            metadataData._id,
            new MetadataEntity({
              externalId: generationId,
            }),
          );
        }
      } else {
        // Clean up all placeholders on failure
        await this.failedGenerationService.handleFailedVideoGeneration(
          this.videosService,
          ingredientData._id,
          websocketUrl,
          user.id,
          getUserRoomName(user.id),
          {
            brand: brand._id.toString(),
            key: ActivityKey.VIDEO_FAILED,
            organization: publicMetadata.organization,
            source: ActivitySource.VIDEO_GENERATION,
            user: publicMetadata.user,
            value: JSON.stringify({
              error: 'Generation failed to start',
              ingredientId: ingredientData._id.toString(),
            }),
          },
        );
      }
    } catch (error: unknown) {
      this.loggerService.error(`${this.constructorName} create failed`, error);

      // Clean up all placeholders on error - PERFORMANCE: Use Promise.all for parallel execution
      await Promise.all(
        pendingIngredientIds.map((pendingId) => {
          const wsUrl = WebSocketPaths.video(pendingId);
          return this.failedGenerationService.handleFailedVideoGeneration(
            this.videosService,
            pendingId,
            wsUrl,
            user.id,
            getUserRoomName(user.id),
            {
              brand: brand._id.toString(),
              key: ActivityKey.VIDEO_FAILED,
              organization: publicMetadata.organization,
              source: ActivitySource.VIDEO_GENERATION,
              user: publicMetadata.user,
              value: JSON.stringify({
                error: (error as Error)?.message || 'Generation failed',
                ingredientId: pendingId,
              }),
            },
          );
        }),
      );

      // Re-throw the error so it can be handled by exception filters and returned to frontend
      throw error;
    }

    // Link video to bookmark if provided
    if (createVideoDto.bookmark) {
      try {
        await this.bookmarksService.addGeneratedIngredient(
          createVideoDto.bookmark,
          ingredientData._id,
        );
        this.loggerService.log('Linked video to bookmark', {
          bookmarkId: createVideoDto.bookmark,
          videoId: ingredientData._id,
        });
      } catch (error: unknown) {
        this.loggerService.warn(
          'Failed to link video to bookmark',
          error as Error,
        );
        // Don't fail the video creation if bookmark linking fails
      }
    }

    // Invalidate cached video listings so placeholders appear immediately
    await this.cacheService.invalidateByTags(['videos']);

    // Handle background music orchestration (runs in background)
    if (createVideoDto.backgroundMusic) {
      const orchestrationContext = {
        brandId: brand._id.toString(),
        clerkUserId: user.id,
        organizationId: publicMetadata.organization,
        userId: publicMetadata.user,
      };

      // Start orchestration in background - don't await
      this.videoMusicOrchestrationService
        .orchestrateVideoWithMusic(
          ingredientData._id.toString(),
          createVideoDto.backgroundMusic,
          createVideoDto.duration || 10,
          createVideoDto.musicVolume ?? 30,
          createVideoDto.muteVideoAudio ?? false,
          orchestrationContext,
        )
        .then((mergedVideoId) => {
          this.loggerService.log('Video+music orchestration completed', {
            mergedVideoId,
            originalVideoId: ingredientData._id.toString(),
          });
        })
        .catch((error: unknown) => {
          this.loggerService.error('Video+music orchestration failed', {
            error: (error as Error)?.message || 'Unknown error',
            originalVideoId: ingredientData._id.toString(),
          });
        });
    }

    // Handle waitForCompletion if requested
    const waitForCompletion = createVideoDto.waitForCompletion === true;
    if (waitForCompletion) {
      try {
        // Wait for all outputs to complete
        const completedIngredients =
          await this.pollingService.waitForMultipleIngredientsCompletion(
            pendingIngredientIds,
            600000, // 10 minutes timeout for videos
            5000, // 5 seconds poll interval
            [
              PopulatePatterns.promptFull,
              PopulatePatterns.metadataFull,
              PopulatePatterns.userMinimal,
              PopulatePatterns.brandMinimal,
            ],
          );

        // Return the first completed video (or all if needed)
        return serializeSingle(
          request,
          VideoSerializer,
          completedIngredients[0],
        );
      } catch (error: unknown) {
        if ((error as Error).name === 'PollingTimeoutError') {
          // Return what we have even if timeout
          const ingredient = await this.videosService.findOne(
            { _id: ingredientData._id },
            [
              PopulatePatterns.promptFull,
              PopulatePatterns.metadataFull,
              PopulatePatterns.userMinimal,
              PopulatePatterns.brandMinimal,
            ],
          );

          if (ingredient) {
            throw new HttpException(
              {
                detail: `Video generation did not complete within 10 minutes. Current status: ${ingredient.status}`,
                title: 'Generation timeout',
              },
              HttpStatus.GATEWAY_TIMEOUT,
            );
          }
        }
        throw error;
      }
    }

    // Return all pending ingredient IDs
    return serializeSingle(request, VideoSerializer, {
      ...ingredientData,
      pendingIngredientIds,
    });
  }

  /**
   * Calculate dynamic video cost based on model pricing type.
   * Mirrors the CreditsGuard.calculateDynamicCost logic for video models.
   */
  private calculateDynamicVideoCost(
    model: {
      cost?: number;
      pricingType?: PricingType;
      costPerUnit?: number;
      minCost?: number;
    },
    width: number,
    height: number,
    duration: number,
  ): number {
    const pricingType = model.pricingType || PricingType.FLAT;
    let baseCost = model.cost || 0;

    if (
      pricingType === PricingType.PER_MEGAPIXEL &&
      width &&
      height &&
      model.costPerUnit
    ) {
      const megapixels = (width * height) / 1_000_000;
      baseCost = Math.ceil(megapixels * model.costPerUnit);
    } else if (
      pricingType === PricingType.PER_SECOND &&
      duration &&
      model.costPerUnit
    ) {
      baseCost = Math.ceil(duration * model.costPerUnit);
    }

    const minCost = model.minCost || 0;
    if (minCost > 0 && baseCost < minCost) {
      baseCost = minCost;
    }

    return baseCost;
  }
}
