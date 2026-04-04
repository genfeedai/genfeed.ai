import { TaskCommentsController } from '@api/collections/task-comments/controllers/task-comments.controller';
import {
  TaskComment,
  TaskCommentSchema,
} from '@api/collections/task-comments/schemas/task-comment.schema';
import { TaskCommentsService } from '@api/collections/task-comments/services/task-comments.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [TaskCommentsController],
  exports: [TaskCommentsService, MongooseModule],
  imports: [
    LoggerModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: TaskComment.name,
          useFactory: () => {
            const schema = TaskCommentSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: 1, isDeleted: 1, task: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index({ isDeleted: 1, organization: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [TaskCommentsService],
})
export class TaskCommentsModule {}
