import { AgentMessagesModule } from '@api/collections/agent-messages/agent-messages.module';
import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { AgentThreadsModule } from '@api/collections/agent-threads/agent-threads.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { WorkspaceTasksController } from '@api/collections/workspace-tasks/controllers/workspace-tasks.controller';
import {
  WorkspaceTask,
  WorkspaceTaskSchema,
} from '@api/collections/workspace-tasks/schemas/workspace-task.schema';
import { WorkspaceTasksService } from '@api/collections/workspace-tasks/services/workspace-tasks.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { QueuesModule } from '@api/queues/core/queues.module';
import { AgentOrchestratorModule } from '@api/services/agent-orchestrator/agent-orchestrator.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [WorkspaceTasksController],
  exports: [WorkspaceTasksService, MongooseModule],
  imports: [
    AgentMessagesModule,
    forwardRef(() => AgentOrchestratorModule),
    forwardRef(() => AgentRunsModule),
    AgentThreadsModule,
    forwardRef(() => IngredientsModule),
    NotificationsPublisherModule,
    SkillsModule,
    forwardRef(() => QueuesModule),
    MongooseModule.forFeatureAsync(
      [
        {
          name: WorkspaceTask.name,
          useFactory: () => {
            const schema = WorkspaceTaskSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { isDeleted: 1, organization: 1, updatedAt: -1 },
              { partialFilterExpression: { isDeleted: false } },
            );
            schema.index(
              { isDeleted: 1, organization: 1, reviewState: 1, updatedAt: -1 },
              { partialFilterExpression: { isDeleted: false } },
            );
            schema.index(
              { isDeleted: 1, organization: 1, status: 1, updatedAt: -1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [WorkspaceTasksService],
})
export class WorkspaceTasksModule {}
