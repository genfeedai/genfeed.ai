import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateMergedVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { VideoMergeOrchestrationService } from '@api/collections/videos/services/video-merge-orchestration.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@Controller('videos')
@UseGuards(RolesGuard)
export class VideosMergeController {
  constructor(
    readonly loggerService: LoggerService,
    private readonly videoMergeOrchestrationService: VideoMergeOrchestrationService,
  ) {}

  // Intentionally uncredited: video merge runs entirely on the internal
  // files-queue (JOB_TYPES.MERGE_VIDEOS — ffmpeg concat/transitions/captions),
  // with no external AI/provider call, so there is no per-call cost to bill.
  // This matches every other local ffmpeg transform (resize/gif/effects/edits),
  // which are likewise uncharged; only provider-backed transforms (upscale/
  // reframe/lip-sync/avatar) carry @Credits. Verified free-by-design in the
  // #1354 REST audit — do not add a CreditsGuard/@Credits here without a
  // corresponding provider cost. Class-level RolesGuard still applies.
  @Post('merge')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'VideosRelationshipsController.mergeVideos',
    summary: 'mergeVideos',
  })
  async mergeVideos(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createMergedVideoDto: CreateMergedVideoDto,
  ) {
    const ingredient = await this.videoMergeOrchestrationService.mergeVideos(
      user,
      createMergedVideoDto,
    );

    return serializeSingle(request, IngredientSerializer, ingredient);
  }
}
