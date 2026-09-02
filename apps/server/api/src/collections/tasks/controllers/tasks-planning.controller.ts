import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { TaskPlanningService } from '@api/collections/tasks/services/task-planning.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { TaskSerializer } from '@genfeedai/serializers';
import {
  Controller,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Tasks')
@AutoSwagger()
@Controller('tasks')
export class TasksPlanningController {
  constructor(private readonly taskPlanningService: TaskPlanningService) {}

  @Post(':id/plan-thread')
  @ApiOperation({
    operationId: 'TasksController.openPlanThread',
    summary: 'openPlanThread',
  })
  async openPlanThread(@CurrentUser() user: User, @Param('id') id: string) {
    const organization = user.organizationId;
    const metadataUserId = this.requireMetadataUserId(user);

    return this.taskPlanningService.openPlanningThread(
      id,
      organization,
      metadataUserId,
    );
  }

  @Post(':id/children')
  @ApiOperation({
    operationId: 'TasksController.createChildren',
    summary: 'createChildren',
  })
  async createChildren(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const organization = user.organizationId;
    const metadataUserId = this.requireMetadataUserId(user);
    const tasks = await this.taskPlanningService.createFollowUpTasks(
      id,
      organization,
      metadataUserId,
    );

    return serializeCollection(request, TaskSerializer, {
      docs: tasks,
      totalDocs: tasks.length,
    });
  }

  private requireMetadataUserId(user: User): string {
    const metadataUserId = user.userId ?? user.id;

    if (!metadataUserId) {
      throw new UnauthorizedException(
        'Missing workspace user context. Please sign in again.',
      );
    }

    return metadataUserId;
  }
}
