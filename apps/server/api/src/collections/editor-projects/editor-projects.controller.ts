import type { CreateEditorProjectDto } from '@api/collections/editor-projects/dto/create-editor-project.dto';
import type { UpdateEditorProjectDto } from '@api/collections/editor-projects/dto/update-editor-project.dto';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import type { EditorProjectDocument } from '@api/collections/editor-projects/schemas/editor-project.schema';
import { EditorRenderService } from '@api/collections/editor-projects/services/editor-render.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ConfigService } from '@api/config/config.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import type { User } from '@clerk/backend';
import {
  EditorTrackType,
  IngredientCategory,
  IngredientFormat,
} from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
  SortObject,
} from '@genfeedai/interfaces';
import { EditorProjectSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { type PipelineStage, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

@AutoSwagger()
@ApiTags('editor-projects')
@ApiBearerAuth()
@Controller('editor-projects')
@UseGuards(RolesGuard)
export class EditorProjectsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    readonly _loggerService: LoggerService,
    private readonly configService: ConfigService,
    private readonly editorProjectsService: EditorProjectsService,
    private readonly editorRenderService: EditorRenderService,
    private readonly ingredientsService: IngredientsService,
    private readonly metadataService: MetadataService,
  ) {}

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateEditorProjectDto,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const orgId = publicMetadata.organization;
    const DEFAULT_FPS = 30;

    const projectPayload: Record<string, unknown> = {
      ...createDto,
      ...(publicMetadata.brand
        ? { brand: new Types.ObjectId(publicMetadata.brand) }
        : {}),
      organization: new Types.ObjectId(orgId),
      user: new Types.ObjectId(publicMetadata.user),
    };

    // If sourceVideoId is provided, build initial video track from real data
    if (createDto.sourceVideoId) {
      const video = await this.ingredientsService.findOne({
        _id: new Types.ObjectId(createDto.sourceVideoId),
        category: IngredientCategory.VIDEO,
        isDeleted: false,
        organization: new Types.ObjectId(orgId),
      });

      if (!video) {
        throw new NotFoundException('Source video not found');
      }

      const metadata = await this.metadataService.findOne({
        ingredient: createDto.sourceVideoId,
      });

      const duration = metadata?.duration || 10;
      const width = metadata?.width || 1920;
      const height = metadata?.height || 1080;
      const fps = DEFAULT_FPS;
      const durationFrames = Math.round(duration * fps);

      const format =
        height > width ? IngredientFormat.PORTRAIT : IngredientFormat.LANDSCAPE;

      const videoUrl = `${this.configService.ingredientsEndpoint}/videos/${createDto.sourceVideoId}`;

      projectPayload.settings = {
        backgroundColor: '#000000',
        format,
        fps,
        height,
        width,
      };

      projectPayload.totalDurationFrames = durationFrames;

      projectPayload.tracks = [
        {
          clips: [
            {
              durationFrames,
              effects: [],
              id: uuidv4(),
              ingredientId: createDto.sourceVideoId,
              ingredientUrl: videoUrl,
              sourceEndFrame: durationFrames,
              sourceStartFrame: 0,
              startFrame: 0,
              thumbnailUrl: video.thumbnailUrl,
            },
          ],
          id: uuidv4(),
          isLocked: false,
          isMuted: false,
          name: 'Video 1',
          type: EditorTrackType.VIDEO,
          volume: 100,
        },
      ];

      if (!metadata) {
        this._loggerService.warn(
          `Metadata missing for video ${createDto.sourceVideoId}, using defaults`,
        );
      }
    }

    const data: EditorProjectDocument =
      await this.editorProjectsService.create(projectPayload);

    return serializeSingle(request, EditorProjectSerializer, data);
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const aggregate: PipelineStage[] = [
      {
        $match: {
          ...(publicMetadata.brand
            ? { brand: new Types.ObjectId(publicMetadata.brand) }
            : {}),
          isDeleted: false,
          organization: new Types.ObjectId(publicMetadata.organization),
        },
      },
      {
        $sort: query.sort
          ? handleQuerySort(query.sort)
          : ({ updatedAt: -1 } as SortObject),
      },
    ];

    const data: AggregatePaginateResult<EditorProjectDocument> =
      await this.editorProjectsService.findAll(aggregate, options);
    return serializeCollection(request, EditorProjectSerializer, data);
  }

  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const data = await this.editorProjectsService.findOne({
      ...(publicMetadata.brand
        ? { brand: new Types.ObjectId(publicMetadata.brand) }
        : {}),
      _id: id,
      isDeleted: false,
      organization: new Types.ObjectId(publicMetadata.organization),
    });

    if (!data) {
      return returnNotFound(this.constructorName, id);
    }

    return serializeSingle(request, EditorProjectSerializer, data);
  }

  @Patch(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateEditorProjectDto,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const existing = await this.editorProjectsService.findOne({
      ...(publicMetadata.brand
        ? { brand: new Types.ObjectId(publicMetadata.brand) }
        : {}),
      _id: id,
      isDeleted: false,
      organization: new Types.ObjectId(publicMetadata.organization),
    });

    if (!existing) {
      return returnNotFound(this.constructorName, id);
    }

    const data: EditorProjectDocument = await this.editorProjectsService.patch(
      id,
      updateDto,
    );

    return serializeSingle(request, EditorProjectSerializer, data);
  }

  @Delete(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const existing = await this.editorProjectsService.findOne({
      ...(publicMetadata.brand
        ? { brand: new Types.ObjectId(publicMetadata.brand) }
        : {}),
      _id: id,
      isDeleted: false,
      organization: new Types.ObjectId(publicMetadata.organization),
    });

    if (!existing) {
      return returnNotFound(this.constructorName, id);
    }

    const data: EditorProjectDocument = await this.editorProjectsService.patch(
      id,
      { isDeleted: true },
    );

    return serializeSingle(request, EditorProjectSerializer, data);
  }

  @Post(':id/render')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async render(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const result = await this.editorRenderService.render(
      id,
      publicMetadata.organization,
      user,
    );

    return serializeSingle(request, EditorProjectSerializer, result);
  }
}
