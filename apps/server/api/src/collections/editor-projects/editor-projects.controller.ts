import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateEditorProjectDto } from '@api/collections/editor-projects/dto/create-editor-project.dto';
import { UpdateEditorProjectDto } from '@api/collections/editor-projects/dto/update-editor-project.dto';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { type EditorProjectDocument } from '@api/collections/editor-projects/schemas/editor-project.schema';
import { EditorRenderService } from '@api/collections/editor-projects/services/editor-render.service';
import { RemotionCompositionsService } from '@api/collections/editor-projects/services/remotion-compositions.service';
import { buildEditorProjectListAggregate } from '@api/collections/editor-projects/utils/editor-project-list-query.util';
import {
  editorTrackIngredientIds,
  relinkEditorTracks,
} from '@api/collections/editor-projects/utils/editor-track-media.util';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import {
  categoryToPlural,
  EditorProjectStatus,
  EditorTrackType,
  IngredientCategory,
  IngredientFormat,
} from '@genfeedai/contracts';
import type {
  IEditorProjectSeed,
  IEditorTrack,
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
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
@FeatureFlag('studio_editor')
@OrganizationModule('editor')
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

    // Seed videos become ordered clips on one video track, back to back, so a
    // Generate result, a Clips result or a storyboard's shots open ready to
    // finish. Each clip keeps its source ingredient as lineage.
    const sourceVideoIds = createDto.sourceVideoIds ?? [];
    if (sourceVideoIds.length > 0) {
      const seeded = await this.buildSeededVideoTrack(user, sourceVideoIds);
      settings = seeded.settings;
      totalDurationFrames = seeded.totalDurationFrames;
      tracks = [seeded.track];
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
          ...(sourceVideoIds.length > 0 ? { sourceVideoIds } : {}),
        },
        organizationId: orgId,
        tracks,
        userId: user.userId ?? user.id,
      } as CreateEditorProjectDto,
    );

    return serializeSingle(request, EditorProjectSerializer, data);
  }

  /**
   * Resolves every seed video in the caller's organization and brand, skipping
   * nothing: a missing, deleted or foreign video fails the whole create rather
   * than silently dropping a shot from the sequence.
   */
  private async buildSeededVideoTrack(
    user: User,
    sourceVideoIds: readonly string[],
  ): Promise<IEditorProjectSeed> {
    const fps = 30;
    const sources = await Promise.all(
      sourceVideoIds.map(async (videoId) => {
        const video = await this.ingredientsService.findOne({
          ...(user.brandId ? { brandId: user.brandId } : {}),
          category: IngredientCategory.VIDEO,
          id: videoId,
          isDeleted: false,
          organizationId: user.organizationId,
        });

        if (!video) {
          throw new NotFoundException('Source video', videoId);
        }

        const metadata = await this.metadataService.findOne({
          ingredients: { some: { id: videoId } },
        });

        if (!metadata) {
          this._loggerService.warn(
            `Metadata missing for video ${videoId}, using defaults`,
          );
        }

        return { metadata, video, videoId };
      }),
    );

    const [first] = sources;
    const width = first.metadata?.width || 1920;
    const height = first.metadata?.height || 1080;
    let startFrame = 0;
    const clips: IEditorTrack['clips'] = sources.map(
      ({ metadata, video, videoId }) => {
        const durationFrames = Math.round((metadata?.duration || 10) * fps);
        const clip = {
          durationFrames,
          effects: [],
          id: uuidv4(),
          ingredientId: videoId,
          ingredientUrl: `${this.configService.ingredientsEndpoint}/videos/${videoId}`,
          sourceEndFrame: durationFrames,
          sourceStartFrame: 0,
          startFrame,
          thumbnailUrl:
            typeof video.thumbnailUrl === 'string'
              ? video.thumbnailUrl
              : undefined,
        };
        startFrame += durationFrames;
        return clip;
      },
    );

    return {
      settings: {
        backgroundColor: '#000000',
        format:
          height > width
            ? IngredientFormat.PORTRAIT
            : IngredientFormat.LANDSCAPE,
        fps,
        height,
        width,
      },
      totalDurationFrames: startFrame,
      track: {
        clips,
        id: uuidv4(),
        isLocked: false,
        isMuted: false,
        name: 'Video 1',
        type: EditorTrackType.VIDEO,
        volume: 100,
      },
    };
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const tenant = CollectionFilterUtil.resolveListOrganizationId(
      query,
      user,
      request,
    );
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const aggregate = buildEditorProjectListAggregate(query, user, tenant);

    const data: AggregatePaginateResult<EditorProjectDocument> =
      await this.editorProjectsService.findAll(aggregate, options);
    return serializeCollection(request, EditorProjectSerializer, data);
  }

  @TenantReadPolicy('selected')
  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const readScope = resolveTenantReadScope(user);
    // Org-scoped id lookup only — do not require brandId match. Projects are
    // often opened from the org shell (`/:org/~`) even when created under a
    // brand; brand-filtering here caused false 404s ("Controller doesn't exist").
    const data = await this.editorProjectsService.findOne({
      id,
      organizationId: readScope.organizationId,
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
    const ingredientIds = editorTrackIngredientIds(tracks);

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

    return relinkEditorTracks(tracks, urlByIngredientId);
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

    // `patch(id)` writes by primary key alone, which the tenant guard rejects.
    const data: EditorProjectDocument | null =
      await this.editorProjectsService.patchOneWhere(
        scopedWhere(user.organizationId, { id }),
        { isDeleted: true },
      );

    if (!data) {
      return returnNotFound('Editor project', id);
    }

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
  @OrganizationModule('editor', 'read')
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
