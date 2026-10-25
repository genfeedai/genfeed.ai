import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import { AnalyzeYoutubeDto } from '@api/collections/clipper-projects/dto/analyze-youtube.dto';
import { CreateClipperProjectDraftDto } from '@api/collections/clipper-projects/dto/create-clipper-project-draft.dto';
import { CreateClipperProjectFromIngredientDto } from '@api/collections/clipper-projects/dto/create-clipper-project-from-ingredient.dto';
import { CreateClipperProjectFromYoutubeDto } from '@api/collections/clipper-projects/dto/create-clipper-project-from-youtube.dto';
import { FinalizeClipperUploadDto } from '@api/collections/clipper-projects/dto/finalize-clipper-upload.dto';
import { PrepareClipperUploadDto } from '@api/collections/clipper-projects/dto/prepare-clipper-upload.dto';
import { UpdateClipperProjectDraftDto } from '@api/collections/clipper-projects/dto/update-clipper-project-draft.dto';
import {
  type ClipperProjectAnalysisResult,
  type ClipperProjectIngestionResult,
  ClipperProjectIngestionService,
  type PrepareClipperUploadResult,
} from '@api/collections/clipper-projects/services/clipper-project-ingestion.service';
import { ClipperProjectLibrarySourceService } from '@api/collections/clipper-projects/services/clipper-project-library-source.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { ClipperProjectSerializer } from '@genfeedai/serializers';
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
@ApiTags('clipper-projects')
@ApiBearerAuth()
@FeatureFlag('clipper')
@OrganizationModule('clipper')
@Controller('clipper-projects')
@UseGuards(RolesGuard)
export class ClipperProjectIngestionController {
  constructor(
    readonly _loggerService: LoggerService,
    private readonly clipperProjectIngestionService: ClipperProjectIngestionService,
    private readonly clipperProjectsService: ClipperProjectsService,
    private readonly clipperProjectLibrarySourceService: ClipperProjectLibrarySourceService,
  ) {}

  @Post('drafts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    description:
      'Create an empty draft clip project whose new-project form autosaves until it starts.',
    operationId: 'ClipperProjectsController.createDraft',
    summary: 'Create a draft clip project',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createDraft(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: CreateClipperProjectDraftDto,
  ): Promise<JsonApiSingleResponse> {
    const data = await this.clipperProjectIngestionService.createDraft(
      user,
      dto,
    );
    return serializeSingle(request, ClipperProjectSerializer, data);
  }

  @Patch(':projectId/draft')
  @ApiOperation({
    description:
      'Autosave new-project form fields on a draft clip project. Refused once the project has started.',
    operationId: 'ClipperProjectsController.saveDraft',
    summary: 'Autosave a draft clip project',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: false })
  async saveDraft(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateClipperProjectDraftDto,
  ): Promise<JsonApiSingleResponse> {
    const data = await this.clipperProjectsService.saveDraft(
      projectId,
      user.organizationId,
      dto,
    );
    return serializeSingle(request, ClipperProjectSerializer, data);
  }

  @Post('from-ingredient')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    description:
      'Create a clip project from a Library video asset and start highlight analysis. Refuses assets outside Clips source limits before any analysis starts.',
    operationId: 'ClipperProjectsController.createFromIngredient',
    summary: 'Library video → Clips analysis',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  createFromIngredient(
    @CurrentUser() user: User,
    @Body() dto: CreateClipperProjectFromIngredientDto,
  ): Promise<ClipperProjectAnalysisResult> {
    return this.clipperProjectLibrarySourceService.createFromIngredient(
      user,
      dto,
    );
  }

  @Post('from-youtube')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    description:
      'Create a clip project from a YouTube URL. Downloads audio, transcribes, detects highlights, and generates avatar or raw-cut clips asynchronously.',
    operationId: 'ClipperProjectsController.createFromYoutube',
    summary: 'YouTube → Clip Factory',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  createFromYoutube(
    @CurrentUser() user: User,
    @Body() dto: CreateClipperProjectFromYoutubeDto,
  ): Promise<ClipperProjectIngestionResult> {
    return this.clipperProjectIngestionService.createFromYoutube(user, dto);
  }

  @Post('from-upload')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    description:
      'Create an authenticated Studio clip project and a presigned source upload. The upload URL is ephemeral and is never persisted on the project.',
    operationId: 'ClipperProjectsController.prepareUpload',
    summary: 'Prepare a long-form clip source upload',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  prepareUpload(
    @CurrentUser() user: User,
    @Body() dto: PrepareClipperUploadDto,
  ): Promise<PrepareClipperUploadResult> {
    return this.clipperProjectIngestionService.prepareUpload(user, dto);
  }

  @Post(':projectId/source/finalize')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    description:
      'Confirm an uploaded source, validate its authoritative metadata, and idempotently queue the configured quick or review flow.',
    operationId: 'ClipperProjectsController.finalizeUpload',
    summary: 'Finalize and process a clip source upload',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  finalizeUpload(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() dto: FinalizeClipperUploadDto,
  ): Promise<ClipperProjectIngestionResult> {
    return this.clipperProjectIngestionService.finalizeUpload(
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
    operationId: 'ClipperProjectsController.retrySource',
    summary: 'Retry failed clip source processing',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  retrySource(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
  ): Promise<ClipperProjectIngestionResult> {
    return this.clipperProjectIngestionService.retrySource(user, projectId);
  }

  @Post('analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    description:
      'Analyze a YouTube URL: download audio, transcribe, detect highlights. Analysis does not charge credits. Returns projectId to poll for results.',
    operationId: 'ClipperProjectsController.analyzeYoutube',
    summary: 'Analyze YouTube video for highlights',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  analyzeYoutube(
    @CurrentUser() user: User,
    @Body() dto: AnalyzeYoutubeDto,
  ): Promise<ClipperProjectAnalysisResult> {
    return this.clipperProjectIngestionService.analyzeYoutube(user, dto);
  }
}
