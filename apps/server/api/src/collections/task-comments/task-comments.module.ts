import { MentionsModule } from '@api/collections/mentions/mentions.module';
import { TaskCommentsController } from '@api/collections/task-comments/controllers/task-comments.controller';
import { TaskCommentsService } from '@api/collections/task-comments/services/task-comments.service';
import { UsersCoreModule } from '@api/collections/users/users-core.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [TaskCommentsController],
  exports: [TaskCommentsService],
  imports: [LoggerModule, MentionsModule, UsersCoreModule],
  providers: [TaskCommentsService],
})
export class TaskCommentsModule {}
