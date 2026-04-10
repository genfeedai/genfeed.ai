import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { TaskCommentsModule } from '@api/collections/task-comments/task-comments.module';
import { TaskCountersModule } from '@api/collections/task-counters/task-counters.module';
import { TasksController } from '@api/collections/tasks/controllers/tasks.controller';
import { Task, TaskSchema } from '@api/collections/tasks/schemas/task.schema';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [TasksController],
  exports: [TasksService, MongooseModule],
  imports: [
    TaskCommentsModule,
    TaskCountersModule,
    forwardRef(() => OrganizationsModule),
    LoggerModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: Task.name,
          useFactory: () => {
            const schema = TaskSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { isDeleted: 1, organization: 1, updatedAt: -1 },
              { partialFilterExpression: { isDeleted: false } },
            );
            schema.index({ identifier: 1, organization: 1 }, { unique: true });
            schema.index({ organization: 1, taskNumber: 1 }, { unique: true });
            schema.index({ isDeleted: 1, parentId: 1 });
            schema.index({ isDeleted: 1, organization: 1, projectId: 1 });
            schema.index({ goalId: 1, isDeleted: 1, organization: 1 });
            schema.index({
              isDeleted: 1,
              organization: 1,
              reviewState: 1,
              updatedAt: -1,
            });
            schema.index({
              isDeleted: 1,
              organization: 1,
              status: 1,
              updatedAt: -1,
            });
            schema.index(
              { 'linkedEntities.entityId': 1, 'linkedEntities.entityModel': 1 },
              {
                partialFilterExpression: {
                  'linkedEntities.0': { $exists: true },
                },
              },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [TasksService],
})
export class TasksModule {}
