import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  buildAgentThreadActor,
  resolveAgentThreadReadOrganizationId,
} from '@api/collections/agent-threads/utils/agent-thread-actor.util';
import {
  resolveAgentThreadDatabaseUserId,
  resolveAgentThreadOrganizationId,
} from '@api/collections/agent-threads/utils/agent-thread-identity.util';
import { CreateTaskReviewRequestDto } from '@api/collections/tasks/dto/create-task-review-request.dto';
import { TaskReviewRequestsService } from '@api/collections/tasks/services/task-review-requests.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { TaskSerializer } from '@genfeedai/serializers';
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * Review requests on a Library asset (#9945). Each is a review task with the
 * reviewer as assignee; the reviewer decides it through `PATCH /tasks/:id`.
 */
@ApiTags('Tasks')
@FeatureFlag('agent')
@Controller('ingredients/:ingredientId/review-requests')
export class IngredientReviewRequestsController {
  constructor(
    private readonly taskReviewRequestsService: TaskReviewRequestsService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the review requests on an asset' })
  async list(
    @Req() req: Request,
    @Param('ingredientId') ingredientId: string,
    @CurrentUser() user: User,
  ) {
    const docs = await this.taskReviewRequestsService.list(
      await this.actorFor(
        user,
        resolveAgentThreadReadOrganizationId(req, user),
      ),
      ingredientId,
    );
    return serializeCollection(req, TaskSerializer, {
      docs,
      totalDocs: docs.length,
    });
  }

  @Get('candidates')
  @ApiOperation({
    summary: 'The teammates who can be asked to review an asset',
  })
  async candidates(
    @Req() req: Request,
    @Param('ingredientId') ingredientId: string,
    @CurrentUser() user: User,
  ): Promise<{ reviewerUserIds: string[] }> {
    const reviewerUserIds =
      await this.taskReviewRequestsService.listReviewerCandidates(
        await this.actorFor(
          user,
          resolveAgentThreadReadOrganizationId(req, user),
        ),
        ingredientId,
      );
    return { reviewerUserIds };
  }

  @Post()
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({ summary: 'Ask teammates to review an asset' })
  async create(
    @Req() req: Request,
    @Param('ingredientId') ingredientId: string,
    @Body() body: CreateTaskReviewRequestDto,
    @CurrentUser() user: User,
  ) {
    const docs = await this.taskReviewRequestsService.request(
      await this.actorFor(user, resolveAgentThreadOrganizationId(user)),
      ingredientId,
      body,
    );
    return serializeCollection(req, TaskSerializer, {
      docs,
      totalDocs: docs.length,
    });
  }

  private async actorFor(user: User, organizationId: string) {
    return buildAgentThreadActor(
      user,
      organizationId,
      await resolveAgentThreadDatabaseUserId(user, this.usersService),
    );
  }
}
