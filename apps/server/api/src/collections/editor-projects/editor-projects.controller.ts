import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateEditorProjectDto } from '@api/collections/editor-projects/dto/create-editor-project.dto';
import { UpdateEditorProjectDto } from '@api/collections/editor-projects/dto/update-editor-project.dto';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { type EditorProjectDocument } from '@api/collections/editor-projects/schemas/editor-project.schema';
import { EditorRenderService } from '@api/collections/editor-projects/services/editor-render.service';
import { RemotionCompositionsService } from '@api/collections/editor-projects/services/remotion-compositions.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import {
  categoryToPlural,
  EditorProjectStatus,
  EditorTrackType,
  IngredientCategory,
  IngredientFormat,
} from '@genfeedai/contracts';
import type {
  IEditorTrack,
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
  SortObject,
} from '@genfeedai/contracts/interfaces';
import { EditorProjectSerializer } from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';

@AutoSwagger()
@ApiTags('editor-projects')
@ApiBearerAuth()
@Controller('editor-projects')
@UseGuards(RolesGuard)
export class EditorProjectsController {
  constructor(
    readonly _loggerService: LoggerService,
    private readonly configService: ConfigService,
    private readonly editorProjectsService: EditorProjectsService,
    private readonly editorRenderService: EditorRenderService,
    private readonly ingredientsService: IngredientsService,
    private readonly metadataService: MetadataService,
    private readonly compositionsService: RemotionCompositionsService,
  ) {}

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateEditorProjectDto,
  ): Promise<JsonApiSingleResponse> {
    const orgId = user.organizationId;
    const DEFAULT_FPS = 30;
    const DEFAULT_DURATION_FRAMES = DEFAULT_FPS * 10;

    const name = createDto.name?.trim() || 'Untitled Project';
    let settings = {
      backgroundColor: createDto.settings?.backgroundColor || '#000000',
      format: createDto.settings?.format || IngredientFormat.LANDSCAPE,
      fps: createDto.settings?.fps || DEFAULT_FPS,
      height: createDto.settings?.height || 1080,
      width: createDto.settings?.width || 1920,
    };
    let totalDurationFrames =
      createDto.totalDurationFrames || DEFAULT_DURATION_FRAMES;
    let tracks: unknown[] = Array.isArray(createDto.tracks)
      ? createDto.tracks
      : [];

    // If sourceVideoId is provided, build initial video track from real data
    if (createDto.sourceVideoId) {
      const video = await this.ingredientsService.findOne({
        id: createDto.sourceVideoId,
        category: IngredientCategory.VIDEO,
        organizationId: orgId,
      });

      if (!video) {
        throw new NotFoundException('Source video');
      }

      const metadata = await this.metadataService.findOne({
        ingredients: { some: { id: createDto.sourceVideoId } },
      });

      const duration = metadata?.duration || 10;
      const width = metadata?.width || 1920;
      const height = metadata?.height || 1080;
      const fps = DEFAULT_FPS;
      const durationFrames = Math.round(duration * fps);

      const format =
        height > width ? IngredientFormat.PORTRAIT : IngredientFormat.LANDSCAPE;

      const videoUrl = `${this.configService.ingredientsEndpoint}/videos/${createDto.sourceVideoId}`;

      settings = {
        backgroundColor: '#000000',
        format,
        fps,
        height,
        width,
      };
      totalDurationFrames = durationFrames;
      tracks = [
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

    // Prisma columns: organizationId/userId/brandId + tracks Json + config Json.
    // Domain fields (name/settings/status/duration) live under config and are
    // flattened on read via BaseService.normalizeDocument.
    const data: EditorProjectDocument = await this.editorProjectsService.create(
      {
        ...(user.brandId ? { brandId: user.brandId } : {}),
        config: {
          name,
          settings,
          status: EditorProjectStatus.DRAFT,
          totalDurationFrames,
          ...(createDto.sourceVideoId
            ? { sourceVideoId: createDto.sourceVideoId }
            : {}),
        },
        organizationId: orgId,
        tracks,
        userId: user.userId ?? user.id,
      } as CreateEditorProjectDto,
    );

    return serializeSingle(request, EditorProjectSerializer, data);
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const aggregate = {
      where: {
        ...(user.brandId ? { brandId: user.brandId } : {}),
        isDeleted: false,
        organizationId: user.organizationId,
      },
      orderBy: query.sort
        ? handleQuerySort(query.sort)
        : ({ updatedAt: -1 } as SortObject),
    };

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
    // Org-scoped id lookup only — do not require brandId match. Projects are
    // often opened from the org shell (`/:org/~`) even when created under a
    // brand; brand-filtering here caused false 404s ("Controller doesn't exist").
    const data = await this.editorProjectsService.findOne({
      id,
      organizationId: user.organizationId,
    });

    if (!data) {
      return returnNotFound('Editor project', id);
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
    const existing = await this.editorProjectsService.findOne({
      id,
      organizationId: user.organizationId,
    });

    if (!existing) {
      return returnNotFound('Editor project', id);
    }

    if (existing.config?.composition) {
      throw new ConflictException(
        'Approved compositions are immutable. Submit updated inputs with a new requestId.',
      );
    }

    const { name, settings, thumbnailUrl, totalDurationFrames, tracks } =
      updateDto;
    const data: EditorProjectDocument =
      await this.editorProjectsService.updateEditorContent(
        id,
        user.organizationId,
        {
          name,
          settings,
          thumbnailUrl,
          totalDurationFrames,
          tracks: tracks as IEditorTrack[] | undefined,
        },
      );

    return serializeSingle(request, EditorProjectSerializer, data);
  }

  /**
   * Copy a project into a new, editable draft. Composition-backed projects are
   * immutable, so this is how a user edits one: the copy keeps the tracks and
   * settings but never the composition provenance or render output.
   */
  @Post(':id/duplicate')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async duplicate(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const source = await this.editorProjectsService.findOne({
      id,
      isDeleted: false,
      organizationId: user.organizationId,
    });

    if (!source) {
      return returnNotFound('Editor project', id);
    }

    // The copy lands under the source brand, so the member must be allowed to
    // create work there, not merely belong to the organization.
    if (source.brandId) {
      await this.compositionsService.authorizeBrand(user, source.brandId);
    }

    const sourceName =
      typeof source.name === 'string' && source.name.trim()
        ? source.name.trim()
        : 'Untitled Project';

    const data: EditorProjectDocument = await this.editorProjectsService.create(
      {
        ...(source.brandId ? { brandId: source.brandId } : {}),
        config: {
          name: `${sourceName} (copy)`,
          settings: source.settings,
          status: EditorProjectStatus.DRAFT,
          totalDurationFrames: source.totalDurationFrames,
        },
        organizationId: user.organizationId,
        tracks: await this.resolveMediaClipUrls(
          source.tracks,
          user.organizationId,
        ),
        userId: user.userId ?? user.id,
      } as CreateEditorProjectDto,
    );

    return serializeSingle(request, EditorProjectSerializer, data);
  }

  /**
   * Point media clips at their ingredient's canonical URL. Composition tracks
   * carry a placeholder source URL that only the render path resolves, so a
   * copy would otherwise open with footage that cannot load. Ingredients the
   * organization can no longer read keep their clip unchanged.
   */
  private async resolveMediaClipUrls(
    tracks: IEditorTrack[],
    organizationId: string,
  ): Promise<IEditorTrack[]> {
    const ingredientIds = Array.from(
      new Set(
        tracks
          .filter((track) => track.type !== EditorTrackType.TEXT)
          .flatMap((track) => track.clips.map((clip) => clip.ingredientId))
          .filter((ingredientId) => Boolean(ingredientId)),
      ),
    );

    if (ingredientIds.length === 0) {
      return tracks;
    }

    const result = await this.ingredientsService.findAll(
      {
        where: {
          id: { in: ingredientIds },
          isDeleted: false,
          organizationId,
        },
      },
      { pagination: false },
      false,
    );
    const urlByIngredientId = new Map(
      result.docs.map((ingredient) => [
        String(ingredient.id),
        `${this.configService.ingredientsEndpoint}/${categoryToPlural(String(ingredient.category))}/${ingredient.id}`,
      ]),
    );

    return tracks.map((track) =>
      track.type === EditorTrackType.TEXT
        ? track
        : {
            ...track,
            clips: track.clips.map((clip) => {
              const ingredientUrl = urlByIngredientId.get(clip.ingredientId);
              return ingredientUrl ? { ...clip, ingredientUrl } : clip;
            }),
          },
    );
  }

  @Delete(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const existing = await this.editorProjectsService.findOne({
      id,
      organizationId: user.organizationId,
    });

    if (!existing) {
      return returnNotFound('Editor project', id);
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
    const project = await this.editorProjectsService.findForRender(
      id,
      user.organizationId,
    );
    if (project.config?.composition)
      throw new ConflictException(
        'Use the composition retry action to retry this render.',
      );
    const result = await this.editorRenderService.render(
      id,
      user.organizationId,
      user,
    );

    return serializeSingle(request, EditorProjectSerializer, result);
  }

  @Post(':id/render/cancel')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async cancelRender(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const project = await this.editorProjectsService.findForRender(
      id,
      user.organizationId,
    );
    if (project.config?.composition)
      throw new ConflictException(
        'Use the composition cancel action to cancel this render.',
      );
    const result = await this.editorRenderService.cancel(
      id,
      user.organizationId,
    );

    return serializeSingle(request, EditorProjectSerializer, result);
  }
}
