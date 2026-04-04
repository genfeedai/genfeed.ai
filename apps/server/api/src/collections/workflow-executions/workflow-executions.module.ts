/**
 * Workflow Executions Module
 * Tracks execution history for workflows including node-by-node results,
 * duration, status, and error information.
 */
import { UsersModule } from '@api/collections/users/users.module';
import { InternalWorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/internal-workflow-executions.controller';
import { WorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/workflow-executions.controller';
import {
  WorkflowExecution,
  WorkflowExecutionSchema,
} from '@api/collections/workflow-executions/schemas/workflow-execution.schema';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [
    WorkflowExecutionsController,
    InternalWorkflowExecutionsController,
  ],
  exports: [MongooseModule, WorkflowExecutionsService],
  imports: [
    forwardRef(() => WorkflowsModule),
    forwardRef(() => UsersModule),
    MongooseModule.forFeatureAsync(
      [
        {
          name: WorkflowExecution.name,
          useFactory: () => {
            const schema = WorkflowExecutionSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Index for listing executions by workflow
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1, workflow: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Index for filtering by status
            schema.index(
              { isDeleted: 1, organization: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Index for finding recent executions
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [AdminApiKeyGuard, WorkflowExecutionsService],
})
export class WorkflowExecutionsModule {}
