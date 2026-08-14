import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateTaskCommentDto } from '@api/collections/task-comments/dto/create-task-comment.dto';
import { TaskCommentsService } from '@api/collections/task-comments/services/task-comments.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { TaskCommentSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Task Comments')
@AutoSwagger()
@Controller('tasks/:taskId/comments')
export class TaskCommentsController {
  constructor(private readonly taskCommentsService: TaskCommentsService) {}

  @Get()
  async findAll(
    @Req() request: Request,
    @Param('taskId') taskId: string,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    const docs = await this.taskCommentsService.findByTask(
      taskId,
      organization,
    );
    return serializeCollection(request, TaskCommentSerializer, {
      docs,
    });
  }

  @Post()
  async create(
    @Req() request: Request,
    @Param('taskId') taskId: string,
    @CurrentUser() user: User,
    @Body() createDto: CreateTaskCommentDto,
  ) {
    const doc = await this.taskCommentsService.create({
      ...createDto,
      authorUserId: user.userId ?? user.id,
      organizationId: user.organizationId,
      taskId: taskId,
    } as CreateTaskCommentDto & {
      authorUserId: string;
      organizationId: string;
      taskId: string;
    });

    return serializeSingle(request, TaskCommentSerializer, doc);
  }

  @Delete(':commentId')
  async remove(
    @Param('commentId') commentId: string,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    const comment = await this.taskCommentsService.findOne({
      id: commentId,
      organizationId: organization,
    });

    if (!comment) {
      return { deleted: false };
    }

    await this.taskCommentsService.patch(commentId, { isDeleted: true });
    return { deleted: true };
  }
}
