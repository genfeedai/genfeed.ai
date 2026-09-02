import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VideoExtendDto } from '@api/collections/videos/dto/video-extend.dto';
import { VideoGenerationCreditsService } from '@api/collections/videos/services/video-generation-credits.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import type { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
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
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { hasNativeExtend } from '@genfeedai/constants';
import {
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
  ModelCategory,
  WorkflowTrigger,
} from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { WorkflowSerializer } from '@genfeedai/serializers';
import { buildVideoExtensionTemplate } from '@genfeedai/workflows/engine';
import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

@AutoSwagger()
@Controller('videos')
export class VideosExtendController {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly videoGenerationCreditsService: VideoGenerationCreditsService,
    private readonly videosService: VideosService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  @Post(':videoId/extend')
  @Credits({
    description: 'Video extension',
    source: ActivitySource.VIDEO_GENERATION,
  })
  @DeferCreditsUntilModelResolution()
  @ValidateModel({ category: ModelCategory.VIDEO })
  @UseGuards(SubscriptionGuard, CreditsGuard, ModelsGuard)
  @UseInterceptors(CreditsInterceptor)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async extendVideo(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
    @Body() dto: VideoExtendDto,
  ): Promise<JsonApiSingleResponse> {
    const source = await this.videosService.findOne(
      {
        category: IngredientCategory.VIDEO,
        id: videoId,
        isDeleted: false,
        organizationId: user.organizationId,
      },
      [{ path: 'metadata', select: ['duration'] }],
    );
    if (!source) {
      return returnNotFound(this.constructorName, videoId);
    }
    if (
      source.status !== IngredientStatus.GENERATED &&
      source.status !== IngredientStatus.VALIDATED
    ) {
      throw new BadRequestException('Only completed videos can be extended');
    }

    const brandId = source.brandId ?? user.brandId;
    if (!brandId) {
      throw new BadRequestException('A brand is required to extend a video');
    }
    const model = dto.model;
    const dispatchMode = hasNativeExtend(model) ? 'native' : 'fabricated';
    const sourceDuration = source.metadata?.duration;
    if (
      dispatchMode === 'native' &&
      (typeof sourceDuration !== 'number' ||
        !Number.isFinite(sourceDuration) ||
        sourceDuration < 1 ||
        sourceDuration > 30)
    ) {
      throw new BadRequestException(
        'Seedance native extension requires a source video between 1 and 30 seconds',
      );
    }
    await this.videoGenerationCreditsService.ensureExtensionCredits(
      {
        duration: dto.duration ?? 8,
      },
      model,
      user.organizationId,
      request,
      dispatchMode,
    );
    const template = buildVideoExtensionTemplate({
      brandId,
      dispatchMode,
      duration: dto.duration,
      model,
      prompt: dto.prompt,
      sourceVideoId: videoId,
    });
    const workflowDto: CreateWorkflowDto = {
      brandId,
      description: template.description,
      edges: template.edges,
      label: `Extend video ${videoId}`,
      metadata: {
        actionVerb: 'extend',
        dispatchMode,
        model,
        sourceVideoId: videoId,
        templateId: 'clip-chain-video',
      },
      nodes: template.nodes.map((node, index) => ({
        data: { config: node.config, label: node.label },
        id: node.id,
        position: { x: index * 280, y: index % 2 === 0 ? 0 : 160 },
        type: node.type,
      })),
      trigger: WorkflowTrigger.MANUAL,
    };
    const workflow = await this.workflowsService.createWorkflow(
      user.userId ?? user.id,
      user.organizationId,
      workflowDto,
      brandId,
    );

    return serializeSingle(request, WorkflowSerializer, workflow);
  }
}
