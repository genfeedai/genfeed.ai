import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  ApproveStoryboardPlanDto,
  CreateStoryboardRunDto,
  ListStoryboardRunsDto,
  ResetStoryboardPlanDto,
  UpdateStoryboardPlanDto,
  UpdateStoryboardSourceDto,
} from '@api/collections/content-runs/dto/storyboard-run.dto';
import { StoryboardRunsService } from '@api/collections/content-runs/services/storyboard-runs.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  StoryboardRunSerializer,
  StoryboardRunSummarySerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

@Controller('brands/:brandId/storyboard-runs')
export class StoryboardRunsController {
  constructor(private readonly runs: StoryboardRunsService) {}

  @Post()
  async create(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Body() body: CreateStoryboardRunDto,
  ) {
    return serializeSingle(
      request,
      StoryboardRunSerializer,
      await this.runs.create(user.organizationId, brandId, user.userId, body),
    );
  }

  @Get()
  async list(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Query() query: ListStoryboardRunsDto,
  ) {
    return serializeCollection(request, StoryboardRunSummarySerializer, {
      docs: await this.runs.list(user.organizationId, brandId, query),
    });
  }

  @Get(':runId')
  async get(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
  ) {
    return serializeSingle(
      request,
      StoryboardRunSerializer,
      await this.runs.get(user.organizationId, brandId, runId),
    );
  }

  @Patch(':runId/plan')
  async updatePlan(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
    @Body() body: UpdateStoryboardPlanDto,
  ) {
    return serializeSingle(
      request,
      StoryboardRunSerializer,
      await this.runs.updatePlan(user.organizationId, brandId, runId, body),
    );
  }

  @Post(':runId/plan/reset')
  async resetPlan(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
    @Body() body: ResetStoryboardPlanDto,
  ) {
    return serializeSingle(
      request,
      StoryboardRunSerializer,
      await this.runs.resetPlan(user.organizationId, brandId, runId, body),
    );
  }

  @Post(':runId/plan/approve')
  @UseGuards(SubscriptionGuard)
  async approvePlan(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
    @Body() body: ApproveStoryboardPlanDto,
  ) {
    return serializeSingle(
      request,
      StoryboardRunSerializer,
      await this.runs.approvePlan(user.organizationId, brandId, runId, body),
    );
  }

  @Patch(':runId/source')
  async updateSource(
    @Req() request: Request,
    @Param('brandId') brandId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
    @Body() body: UpdateStoryboardSourceDto,
  ) {
    return serializeSingle(
      request,
      StoryboardRunSerializer,
      await this.runs.updateSource(user.organizationId, brandId, runId, body),
    );
  }
}
