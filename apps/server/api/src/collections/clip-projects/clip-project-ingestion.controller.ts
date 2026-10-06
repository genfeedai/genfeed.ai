import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { AnalyzeYoutubeDto } from '@api/collections/clip-projects/dto/analyze-youtube.dto';
import { CreateClipProjectDraftDto } from '@api/collections/clip-projects/dto/create-clip-project-draft.dto';
import { CreateClipProjectFromIngredientDto } from '@api/collections/clip-projects/dto/create-clip-project-from-ingredient.dto';
import { CreateClipProjectFromYoutubeDto } from '@api/collections/clip-projects/dto/create-clip-project-from-youtube.dto';
import { FinalizeClipUploadDto } from '@api/collections/clip-projects/dto/finalize-clip-upload.dto';
import { PrepareClipUploadDto } from '@api/collections/clip-projects/dto/prepare-clip-upload.dto';
import { UpdateClipProjectDraftDto } from '@api/collections/clip-projects/dto/update-clip-project-draft.dto';
import {
  type ClipProjectAnalysisResult,
  type ClipProjectIngestionResult,
  ClipProjectIngestionService,
  type PrepareClipUploadResult,
} from '@api/collections/clip-projects/services/clip-project-ingestion.service';
import { ClipProjectLibrarySourceService } from '@api/collections/clip-projects/services/clip-project-library-source.service';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { ClipProjectSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('clip-projects')
@ApiBearerAuth()
@FeatureFlag('studio_clips')
@Controller('clip-projects')
@UseGuards(RolesGuard)
export class ClipProjectIngestionController {
  constructor(
    readonly _loggerService: LoggerService,
    private readonly clipProjectIngestionService: ClipProjectIngestionService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipProjectLibrarySourceService: ClipProjectLibrarySourceService,
  ) {}

  @Post('drafts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    description:
      'Create an empty draft clip project whose new-project form autosaves until it starts.',
    operationId: 'ClipProjectsController.createDraft',
    summary: 'Create a draft clip project',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createDraft(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: CreateClipProjectDraftDto,
  ): Promise<JsonApiSingleResponse> {
    const data = await this.clipProjectIngestionService.createDraft(user, dto);
    return serializeSingle(request, ClipProjectSerializer, data);
  }

  @Patch(':projectId/draft')
  @ApiOperation({
    description:
      'Autosave new-project form fields on a draft clip project. Refused once the project has started.',
    operationId: 'ClipProjectsController.saveDraft',
    summary: 'Autosave a draft clip project',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: false })
  async saveDraft(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateClipProjectDraftDto,
  ): Promise<JsonApiSingleResponse> {
    const data = await this.clipProjectsService.saveDraft(
      projectId,
      user.organizationId,
      dto,
    );
    return serializeSingle(request, ClipProjectSerializer, data);
  }

  @Post('from-ingredient')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    description:
      'Create a clip project from a Library video asset and start highlight analysis. Refuses assets outside Clips source limits before any analysis starts.',
    operationId: 'ClipProjectsController.createFromIngredient',
    summary: 'Library video → Clips analysis',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  createFromIngredient(
    @CurrentUser() user: User,
    @Body() dto: CreateClipProjectFromIngredientDto,
  ): Promise<ClipProjectAnalysisResult> {
    return this.clipProjectLibrarySourceService.createFromIngredient(user, dto);
  }

  @Post('from-youtube')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    description:
      'Create a clip project from a YouTube URL. Downloads audio, transcribes, detects highlights, and generates avatar or raw-cut clips asynchronously.',
    operationId: 'ClipProjectsController.createFromYoutube',
    summary: 'YouTube → Clip Factory',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  createFromYoutube(
    @CurrentUser() user: User,
    @Body() dto: CreateClipProjectFromYoutubeDto,
  ): Promise<ClipProjectIngestionResult> {
    return this.clipProjectIngestionService.createFromYoutube(user, dto);
  }

  @Post('from-upload')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    description:
      'Create an authenticated Studio clip project and a presigned source upload. The upload URL is ephemeral and is never persisted on the project.',
    operationId: 'ClipProjectsController.prepareUpload',
    summary: 'Prepare a long-form clip source upload',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  prepareUpload(
    @CurrentUser() user: User,
    @Body() dto: PrepareClipUploadDto,
  ): Promise<PrepareClipUploadResult> {
    return this.clipProjectIngestionService.prepareUpload(user, dto);
  }

  @Post(':projectId/source/finalize')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    description:
      'Confirm an uploaded source, validate its authoritative metadata, and idempotently queue the configured quick or review flow.',
    operationId: 'ClipProjectsController.finalizeUpload',
    summary: 'Finalize and process a clip source upload',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  finalizeUpload(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() dto: FinalizeClipUploadDto,
  ): Promise<ClipProjectIngestionResult> {
    return this.clipProjectIngestionService.finalizeUpload(
      user,
      projectId,
      dto.ingredientId,
    );
  }

  @Post(':projectId/source/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    description:
      'Retry only the failed source-processing job for an authenticated Studio clip project.',
    operationId: 'ClipProjectsController.retrySource',
    summary: 'Retry failed clip source processing',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  retrySource(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
  ): Promise<ClipProjectIngestionResult> {
    return this.clipProjectIngestionService.retrySource(user, projectId);
  }

  @Post('analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    description:
      'Analyze a YouTube URL: download audio, transcribe, detect highlights. Analysis does not charge credits. Returns projectId to poll for results.',
    operationId: 'ClipProjectsController.analyzeYoutube',
    summary: 'Analyze YouTube video for highlights',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  analyzeYoutube(
    @CurrentUser() user: User,
    @Body() dto: AnalyzeYoutubeDto,
  ): Promise<ClipProjectAnalysisResult> {
    return this.clipProjectIngestionService.analyzeYoutube(user, dto);
  }
}
