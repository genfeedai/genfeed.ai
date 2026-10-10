import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VideoExtendDto } from '@api/collections/videos/dto/video-extend.dto';
import { VideoExtensionExecutionService } from '@api/collections/videos/services/video-extension-execution.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { ModelsGuard, ValidateModel } from '@api/helpers/guards/models/models.guard';
import { returnNotFound, serializeSingle } from '@api/helpers/utils/response/response.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory, ModelCategory } from '@genfeedai/contracts';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { WorkflowExecutionSerializer } from '@genfeedai/serializers';
import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';

@AutoSwagger()
@Controller('videos')
@OrganizationModule('playground')
export class VideosExtendController {
  constructor(
    private readonly videosService: VideosService,
    private readonly extensionExecution: VideoExtensionExecutionService,
    private readonly prisma: PrismaService,
  ) {}

  @Post(':videoId/extend')
  @HttpCode(202)
  @ValidateModel({ category: ModelCategory.VIDEO })
  @UseGuards(ModelsGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async extendVideo(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
    @Body() dto: VideoExtendDto,
  ): Promise<JsonApiSingleResponse> {
    const source = await this.videosService.findOne({ id: videoId, organizationId: user.organizationId, isDeleted: false, category: IngredientCategory.VIDEO });
    if (!source) return returnNotFound(VideosExtendController.name, videoId);
    // The existing workflow funding compiler owns the hold and terminal settlement.
    // Creating a draft or an ordinary HTTP hold cannot execute a continuation.
    const queued = await this.extensionExecution.enqueue(user, videoId, dto);
    const execution = await this.prisma.workflowExecution.findFirst({ where: { id: queued.executionId, organizationId: user.organizationId, userId: user.userId ?? user.id, isDeleted: false } });
    if (!execution) return returnNotFound(VideosExtendController.name, queued.executionId);
    return serializeSingle(request, WorkflowExecutionSerializer, execution);
  }
}
