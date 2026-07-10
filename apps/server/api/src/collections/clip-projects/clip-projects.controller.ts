import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { AnalyzeYoutubeDto } from '@api/collections/clip-projects/dto/analyze-youtube.dto';
import { CreateClipProjectDto } from '@api/collections/clip-projects/dto/create-clip-project.dto';
import { CreateClipProjectFromYoutubeDto } from '@api/collections/clip-projects/dto/create-clip-project-from-youtube.dto';
import {
  type GenerateClipHighlightDto,
  GenerateClipsDto,
} from '@api/collections/clip-projects/dto/generate-clips.dto';
import { RewriteHighlightDto } from '@api/collections/clip-projects/dto/rewrite-highlight.dto';
import { UpdateClipProjectDto } from '@api/collections/clip-projects/dto/update-clip-project.dto';
import { type ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import { ClipGenerationService } from '@api/collections/clip-projects/services/clip-generation.service';
import { HighlightRewriteService } from '@api/collections/clip-projects/services/highlight-rewrite.service';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { ClipAnalyzeQueueService } from '@api/queues/clip-analyze/clip-analyze.queue.service';
import { ClipFactoryQueueService } from '@api/queues/clip-factory/clip-factory-queue.service';
import { PublishHandoffService } from '@api/services/clip-orchestrator/publish-handoff.service';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { EditorTrackType, IngredientFormat } from '@genfeedai/enums';
import type {
  ClipReadyAction,
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
  SortObject,
} from '@genfeedai/interfaces';
import { ClipProjectSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';

interface ClipEditorHandoffResponse {
  clipProjectId: string;
  clipResultId: string;
  editorPath: string;
  editorProjectId: string;
  videoUrl: string;
}

interface ClipPublishHandoffResponse {
  clipProjectId: string;
  clipResultId: string;
  payload: Awaited<ReturnType<PublishHandoffService['preparePublishHandoff']>>;
}

@AutoSwagger()
@ApiTags('clip-projects')
@ApiBearerAuth()
@Controller('clip-projects')
@UseGuards(RolesGuard)
export class ClipProjectsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    readonly _loggerService: LoggerService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipFactoryQueueService: ClipFactoryQueueService,
    private readonly clipAnalyzeQueueService: ClipAnalyzeQueueService,
    private readonly clipGenerationService: ClipGenerationService,
    private readonly highlightRewriteService: HighlightRewriteService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly clipResultsService: ClipResultsService,
    private readonly editorProjectsService: EditorProjectsService,
    private readonly publishHandoffService: PublishHandoffService,
  ) {}

  @Post('from-youtube')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    description:
      'Create a clip project from a YouTube URL. Downloads audio, transcribes, detects highlights, and generates AI avatar clips asynchronously.',
    summary: 'YouTube → AI Clip Factory',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createFromYoutube(
    @CurrentUser() user: User,
    @Body() dto: CreateClipProjectFromYoutubeDto,
  ): Promise<{
    batchJobId: string;
    estimatedClips: number;
    projectId: string;
    status: string;
  }> {
    const publicMetadata = getPublicMetadata(user);
    const orgId = publicMetadata.organization;
    const userId = publicMetadata.user;
    const estimatedClips = dto.maxClips ?? 10;

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        orgId,
        estimatedClips,
      );

    if (!hasCredits) {
      const currentBalance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(orgId);
      throw new InsufficientCreditsException(estimatedClips, currentBalance);
    }

    // Create the ClipProject record
    const project: ClipProjectDocument = await this.clipProjectsService.create({
      language: dto.language ?? 'en',
      name:
        dto.name ??
        `YouTube Clip Factory — ${new Date().toISOString().slice(0, 10)}`,
      organization: orgId,
      settings: {
        addCaptions: true,
        aspectRatio: '9:16',
        captionStyle: 'default',
        maxClips: estimatedClips,
        maxDuration: 90,
        minDuration: 15,
      },
      sourceVideoUrl: dto.youtubeUrl,
      user: userId,
    });

    const projectId = String(project.id);

    // Enqueue the async pipeline
    const batchJobId = await this.clipFactoryQueueService.enqueue({
      avatarId: dto.avatarId,
      avatarProvider: dto.avatarProvider ?? 'heygen',
      language: dto.language ?? 'en',
      maxClips: estimatedClips,
      minViralityScore: dto.minViralityScore ?? 50,
      orgId,
      projectId,
      userId,
      voiceId: dto.voiceId,
      youtubeUrl: dto.youtubeUrl,
    });

    return {
      batchJobId,
      estimatedClips,
      projectId,
      status: 'processing',
    };
  }

  @Post('analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    description:
      'Analyze a YouTube URL: download audio, transcribe, detect highlights. Cheap step (1 credit). Returns projectId to poll for results.',
    summary: 'Analyze YouTube video for highlights',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async analyzeYoutube(
    @CurrentUser() user: User,
    @Body() dto: AnalyzeYoutubeDto,
  ): Promise<{ projectId: string; status: string }> {
    const publicMetadata = getPublicMetadata(user);
    const orgId = publicMetadata.organization;
    const userId = publicMetadata.user;

    const project: ClipProjectDocument = await this.clipProjectsService.create({
      language: dto.language ?? 'en',
      name:
        dto.name ?? `Clip Analysis — ${new Date().toISOString().slice(0, 10)}`,
      organization: orgId,
      settings: {
        addCaptions: true,
        aspectRatio: '9:16',
        captionStyle: 'default',
        maxClips: dto.maxClips ?? 10,
        maxDuration: 90,
        minDuration: 15,
      },
      sourceVideoUrl: dto.youtubeUrl,
      status: 'pending',
      user: userId,
    });

    const projectId = String(project.id);

    await this.clipAnalyzeQueueService.enqueue({
      language: dto.language ?? 'en',
      maxClips: dto.maxClips ?? 10,
      minViralityScore: dto.minViralityScore ?? 50,
      orgId,
      projectId,
      userId,
      youtubeUrl: dto.youtubeUrl,
    });

    return { projectId, status: 'analyzing' };
  }

  @Get(':projectId/highlights')
  @ApiOperation({
    description:
      'Returns the highlights array from a ClipProject after analysis.',
    summary: 'Get project highlights',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getHighlights(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const project = await this.clipProjectsService.findOne({
      _id: projectId,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!project) {
      throw new NotFoundException('ClipProject', projectId);
    }

    return {
      highlights: project.highlights || [],
      projectId: String(project.id),
      status: project.status,
    };
  }

  @Post(':projectId/highlights/:highlightId/rewrite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      'Rewrite a highlight script using AI to make it more viral for a specific platform and tone.',
    summary: 'Viral rewrite a highlight script',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async rewriteHighlight(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('highlightId') highlightId: string,
    @Body() dto: RewriteHighlightDto,
  ): Promise<{ rewrittenScript: string; originalScript: string }> {
    const publicMetadata = getPublicMetadata(user);

    // Verify the project belongs to the user's org
    const project = await this.clipProjectsService.findOne({
      _id: projectId,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!project) {
      throw new NotFoundException('ClipProject', projectId);
    }

    return this.highlightRewriteService.rewrite(
      projectId,
      highlightId,
      dto.platform ?? 'tiktok',
      dto.tone ?? 'hook',
    );
  }

  @Post(':projectId/generate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    description:
      'Generate avatar video clips for selected highlights. Expensive step (N credits, one per clip).',
    summary: 'Generate clips from selected highlights',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateClips(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() dto: GenerateClipsDto,
  ): Promise<{ clipCount: number; clipResultIds: string[]; status: string }> {
    const publicMetadata = getPublicMetadata(user);
    const orgId = publicMetadata.organization;
    const userId = publicMetadata.user;

    const project = await this.clipProjectsService.findOne({
      _id: projectId,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!project) {
      throw new NotFoundException('ClipProject', projectId);
    }

    if (project.status !== 'analyzed') {
      throw new BadRequestException(
        `Project is in '${project.status}' status. Must be 'analyzed' to generate clips.`,
      );
    }

    const allHighlights = project.highlights || [];
    const editedHighlightsById = new Map<string, GenerateClipHighlightDto>(
      dto.editedHighlights.map((highlight) => [highlight.id, highlight]),
    );
    const persistedHighlights = allHighlights.map((highlight) => {
      const editedHighlight = editedHighlightsById.get(highlight.id);

      if (!editedHighlight) {
        return highlight;
      }

      return {
        ...highlight,
        summary: editedHighlight.summary,
        title: editedHighlight.title,
      };
    });
    const selectedEditedHighlights = persistedHighlights.filter((highlight) =>
      dto.selectedHighlightIds.includes(highlight.id),
    );

    if (selectedEditedHighlights.length === 0) {
      throw new BadRequestException(
        'No valid highlights matched the selected IDs.',
      );
    }

    await this.clipProjectsService.patch(projectId, {
      highlights: persistedHighlights,
      progress: 0,
      status: 'generating',
    });

    const result = await this.clipGenerationService.generateClips({
      avatarId: dto.avatarId,
      highlights: selectedEditedHighlights,
      orgId,
      projectId,
      provider: dto.avatarProvider ?? 'heygen',
      transcriptText: project.transcriptText,
      userId,
      voiceId: dto.voiceId,
    });

    if (result.queuedClipCount === 0) {
      await this.clipProjectsService.patch(projectId, {
        error: 'Clip generation failed before any provider job was queued.',
        progress: 100,
        status: 'failed',
      });
    }

    return {
      clipCount: selectedEditedHighlights.length,
      clipResultIds: result.clipResultIds,
      status: result.queuedClipCount > 0 ? 'generating' : 'failed',
    };
  }

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateClipProjectDto,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const data: ClipProjectDocument = await this.clipProjectsService.create({
      ...createDto,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    return serializeSingle(request, ClipProjectSerializer, data);
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

    const aggregate = {
      where: {
        isDeleted: false,
        organization: publicMetadata.organization,
      },
      orderBy: query.sort
        ? handleQuerySort(query.sort)
        : ({ createdAt: -1 } as SortObject),
    };

    const data: AggregatePaginateResult<ClipProjectDocument> =
      await this.clipProjectsService.findAll(aggregate, options);
    return serializeCollection(request, ClipProjectSerializer, data);
  }

  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const data = await this.clipProjectsService.reconcileTerminalState(
      id,
      publicMetadata.organization,
    );

    if (!data) {
      return returnNotFound(this.constructorName, id);
    }

    return serializeSingle(request, ClipProjectSerializer, data);
  }

  @Post(':projectId/results/:clipResultId/editor-handoff')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      'Validate a ready clip result and create an editor project handoff from its terminal media URL.',
    summary: 'Create editor handoff for a ready clip result',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createEditorHandoff(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('clipResultId') clipResultId: string,
  ): Promise<ClipEditorHandoffResponse> {
    const publicMetadata = getPublicMetadata(user);
    const ownedProject = await this.resolveOwnedProject(
      projectId,
      publicMetadata.organization,
    );
    await this.clipProjectsService.reconcileTerminalState(
      projectId,
      publicMetadata.organization,
      ownedProject,
    );

    const clipResult = await this.resolveReadyClipResult({
      action: 'edit',
      clipResultId,
      organizationId: publicMetadata.organization,
      projectId,
    });
    const videoUrl = this.resolveClipVideoUrl(clipResult);
    const durationFrames = this.resolveClipDurationFrames(clipResult);
    const editorProject = await this.editorProjectsService.create({
      ...(publicMetadata.brand ? { brandId: publicMetadata.brand } : {}),
      config: {
        clipHandoff: {
          clipProjectId: projectId,
          clipResultId: String(clipResult.id),
          source: 'clip-result',
        },
        name: `${this.readString(clipResult.title) ?? 'Clip'} edit`,
        settings: {
          backgroundColor: '#000000',
          format: IngredientFormat.PORTRAIT,
          fps: 30,
          height: 1920,
          width: 1080,
        },
        status: 'draft',
        totalDurationFrames: durationFrames,
      },
      organizationId: publicMetadata.organization,
      tracks: [
        {
          clips: [
            {
              durationFrames,
              effects: [],
              id: uuidv4(),
              ingredientId: String(clipResult.id),
              ingredientUrl: videoUrl,
              sourceEndFrame: durationFrames,
              sourceStartFrame: 0,
              startFrame: 0,
              thumbnailUrl: this.readString(clipResult.thumbnailUrl),
              volume: 100,
            },
          ],
          id: uuidv4(),
          isLocked: false,
          isMuted: false,
          name: 'Clip 1',
          type: EditorTrackType.VIDEO,
          volume: 100,
        },
      ],
      userId: publicMetadata.user,
    } as never);
    const editorProjectId = String(editorProject.id);

    return {
      clipProjectId: projectId,
      clipResultId: String(clipResult.id),
      editorPath: `/editor/${editorProjectId}`,
      editorProjectId,
      videoUrl,
    };
  }

  @Post(':projectId/results/:clipResultId/publish-handoff')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      'Validate a ready clip result and prepare a user-confirmed publish handoff payload.',
    summary: 'Prepare publish handoff for a ready clip result',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createPublishHandoff(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('clipResultId') clipResultId: string,
  ): Promise<ClipPublishHandoffResponse> {
    const publicMetadata = getPublicMetadata(user);
    const ownedProject = await this.resolveOwnedProject(
      projectId,
      publicMetadata.organization,
    );
    await this.clipProjectsService.reconcileTerminalState(
      projectId,
      publicMetadata.organization,
      ownedProject,
    );

    const clipResult = await this.resolveReadyClipResult({
      action: 'publish',
      clipResultId,
      organizationId: publicMetadata.organization,
      projectId,
    });
    const resolvedClipResultId = String(clipResult.id);
    const videoUrl = this.resolveClipVideoUrl(clipResult);
    const payload = await this.publishHandoffService.preparePublishHandoff(
      projectId,
      [resolvedClipResultId],
      {
        assets: {
          [resolvedClipResultId]: {
            caption: this.readString(clipResult.summary) ?? undefined,
            mediaUrl: videoUrl,
            mimeType: 'video/mp4',
          },
        },
        metadata: {
          clipResultId: resolvedClipResultId,
          summary: this.readString(clipResult.summary),
          title: this.readString(clipResult.title),
        },
      },
    );

    return {
      clipProjectId: projectId,
      clipResultId: resolvedClipResultId,
      payload,
    };
  }

  private async resolveOwnedProject(
    projectId: string,
    organizationId: string,
  ): Promise<ClipProjectDocument> {
    const project = await this.clipProjectsService.findOne({
      _id: projectId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!project) {
      throw new NotFoundException('ClipProject', projectId);
    }

    return project;
  }

  private async resolveReadyClipResult(input: {
    action: ClipReadyAction;
    clipResultId: string;
    organizationId: string;
    projectId: string;
  }): Promise<ClipResultDocument> {
    const clipResult =
      await this.clipResultsService.findProjectResultForHandoff({
        clipResultId: input.clipResultId,
        organizationId: input.organizationId,
        projectId: input.projectId,
      });

    if (!clipResult) {
      throw new NotFoundException('ClipResult', input.clipResultId);
    }

    if (!this.isClipReadyForAction(clipResult, input.action)) {
      throw new BadRequestException(
        `ClipResult ${input.clipResultId} is not ready for ${input.action} handoff.`,
      );
    }

    this.resolveClipVideoUrl(clipResult);

    return clipResult;
  }

  private isClipReadyForAction(
    clipResult: ClipResultDocument,
    action: ClipReadyAction,
  ): boolean {
    const readiness = this.readRecord(clipResult.readiness);
    const readyActions = Array.isArray(readiness.readyActions)
      ? readiness.readyActions
      : [];

    if (readyActions.length > 0) {
      return readyActions.includes(action);
    }

    return this.readString(clipResult.status) === 'completed';
  }

  private resolveClipVideoUrl(clipResult: ClipResultDocument): string {
    const videoUrl =
      this.readString(clipResult.captionedVideoUrl) ??
      this.readString(clipResult.videoUrl);

    if (!videoUrl) {
      throw new BadRequestException('Clip result has no terminal video URL.');
    }

    return videoUrl;
  }

  private resolveClipDurationFrames(clipResult: ClipResultDocument): number {
    const duration =
      typeof clipResult.duration === 'number' &&
      Number.isFinite(clipResult.duration)
        ? clipResult.duration
        : 10;

    return Math.max(1, Math.round(duration * 30));
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  @Patch(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateClipProjectDto,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const existing = await this.clipProjectsService.findOne({
      _id: id,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!existing) {
      return returnNotFound(this.constructorName, id);
    }

    const data: ClipProjectDocument = await this.clipProjectsService.patch(
      id,
      updateDto,
    );

    return serializeSingle(request, ClipProjectSerializer, data);
  }
}
