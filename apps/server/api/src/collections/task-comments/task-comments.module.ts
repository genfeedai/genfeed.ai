import { TaskCommentsController } from '@api/collections/task-comments/controllers/task-comments.controller';
import { TaskCommentsService } from '@api/collections/task-comments/services/task-comments.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [TaskCommentsController],
  exports: [TaskCommentsService],
  imports: [LoggerModule],
  providers: [TaskCommentsService],
})
export class TaskCommentsModule {}
