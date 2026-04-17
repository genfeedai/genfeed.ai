import { CreateTaskCommentDto } from '@api/collections/task-comments/dto/create-task-comment.dto';
import { TaskCommentsService } from '@api/collections/task-comments/services/task-comments.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
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
    const { organization } = getPublicMetadata(user);
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
    const publicMetadata = getPublicMetadata(user);
    const doc = await this.taskCommentsService.create({
      ...createDto,
      authorUserId: publicMetadata.user,
      organization: publicMetadata.organization,
      task: taskId,
    } as CreateTaskCommentDto & {
      authorUserId: string;
      task: string;
      organization: string;
    });

    return serializeSingle(request, TaskCommentSerializer, doc);
  }

  @Delete(':commentId')
  async remove(
    @Param('commentId') commentId: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const comment = await this.taskCommentsService.findOne({
      _id: commentId,
      isDeleted: false,
      organization: organization,
    });

    if (!comment) {
      return { deleted: false };
    }

    await this.taskCommentsService.patch(commentId, { isDeleted: true });
    return { deleted: true };
  }
}
