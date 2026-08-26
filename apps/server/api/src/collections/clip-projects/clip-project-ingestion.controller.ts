import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AnalyzeYoutubeDto } from '@api/collections/clip-projects/dto/analyze-youtube.dto';
import { CreateClipProjectFromYoutubeDto } from '@api/collections/clip-projects/dto/create-clip-project-from-youtube.dto';
import {
  type ClipProjectAnalysisResult,
  type ClipProjectIngestionResult,
  ClipProjectIngestionService,
} from '@api/collections/clip-projects/services/clip-project-ingestion.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@AutoSwagger()
@ApiTags('clip-projects')
@ApiBearerAuth()
@Controller('clip-projects')
@UseGuards(RolesGuard)
export class ClipProjectIngestionController {
  constructor(
    readonly _loggerService: LoggerService,
    private readonly clipProjectIngestionService: ClipProjectIngestionService,
  ) {}

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

  @Post('analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    description:
      'Analyze a YouTube URL: download audio, transcribe, detect highlights. Cheap step (1 credit). Returns projectId to poll for results.',
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
