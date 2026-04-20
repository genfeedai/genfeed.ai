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
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
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
import { ClipAnalyzeQueueService } from '@api/queues/clip-analyze/clip-analyze.queue.service';
import { ClipFactoryQueueService } from '@api/queues/clip-factory/clip-factory-queue.service';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { User } from '@clerk/backend';
import type {
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
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

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

    const projectId = String(project._id);

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

    const projectId = String(project._id);

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
      throw new NotFoundException(`ClipProject ${projectId} not found`);
    }

    return {
      highlights: project.highlights || [],
      projectId: String(project._id),
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
      throw new NotFoundException(`ClipProject ${projectId} not found`);
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
      throw new NotFoundException(`ClipProject ${projectId} not found`);
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

    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          isDeleted: false,
          organization: publicMetadata.organization,
        },
      },
      {
        $sort: query.sort
          ? handleQuerySort(query.sort)
          : ({ createdAt: -1 } as SortObject),
      },
    ];

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

    const data = await this.clipProjectsService.findOne({
      _id: id,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!data) {
      return returnNotFound(this.constructorName, id);
    }

    return serializeSingle(request, ClipProjectSerializer, data);
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
