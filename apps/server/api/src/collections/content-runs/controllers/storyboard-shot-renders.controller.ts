import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  QuoteStoryboardShotRendersDto,
  StartStoryboardShotRendersDto,
} from '@api/collections/content-runs/dto/storyboard-run.dto';
import { StoryboardShotRendersService } from '@api/collections/content-runs/services/storyboard-shot-renders.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { StoryboardRunSerializer } from '@genfeedai/serializers';
import { Body, Controller, Param, Post, Req } from '@nestjs/common';

/** Draft and final video renders of a storyboard's shots (#9618). */
@Controller('brands/:brandId/storyboard-runs')
@OrganizationModule('storyboard')
export class StoryboardShotRendersController {
  constructor(private readonly renders: StoryboardShotRendersService) {}

  /** Prices a draft or final video render of approved shots (#9618). */
  @Post(':runId/renders/quote')
  quoteRenders(
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
    @Body() body: QuoteStoryboardShotRendersDto,
  ) {
    return this.renders.quote(user.organizationId, brandId, runId, body);
  }

  @Post(':runId/renders')
  async startRenders(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
    @Body() body: StartStoryboardShotRendersDto,
  ) {
    return serializeSingle(
      request,
      StoryboardRunSerializer,
      await this.renders.start(
        user.organizationId,
        brandId,
        runId,
        user.userId,
        body,
      ),
    );
  }

  @Post(':runId/renders/reconcile')
  async reconcileRenders(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
  ) {
    return serializeSingle(
      request,
      StoryboardRunSerializer,
      await this.renders.reconcile(user.organizationId, brandId, runId),
    );
  }
}
