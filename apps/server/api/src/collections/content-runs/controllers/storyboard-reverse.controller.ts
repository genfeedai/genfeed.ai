import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ReverseStoryboardPlanDto } from '@api/collections/content-runs/dto/storyboard-run.dto';
import { StoryboardReversePlanService } from '@api/collections/content-runs/services/storyboard-reverse-plan.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { StoryboardRunSerializer } from '@genfeedai/serializers';
import { Body, Controller, Param, Post, Req } from '@nestjs/common';

/** Reverse engineering of a reference video or image into shots (#10578). */
@Controller('brands/:brandId/storyboard-runs')
@OrganizationModule('storyboard')
export class StoryboardReverseController {
  constructor(private readonly reverse: StoryboardReversePlanService) {}

  /** Replaces the shots with the recipe read from a Library video, or adds a reference image. */
  @Post(':runId/plan/reverse')
  async reversePlan(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
    @Body() body: ReverseStoryboardPlanDto,
  ) {
    const { run } = await this.reverse.reverse(
      user.organizationId,
      brandId,
      runId,
      body,
    );
    return serializeSingle(request, StoryboardRunSerializer, run);
  }
}
