import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AgentWorkflowsController } from '@api/workflows/agent-workflows.controller';
import { AgentWorkflowsService } from '@api/workflows/agent-workflows.service';
import {
  AgentWorkflow,
  AgentWorkflowSchema,
} from '@api/workflows/schemas/agent-workflow.schema';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

export function createAgentWorkflowSchema() {
  const schema = AgentWorkflowSchema.clone();

  schema.index(
    { agentId: 1, linkedConversationId: 1, organization: 1 },
    { name: 'idx_agent_workflows_conversation' },
  );
  schema.index(
    { createdAt: -1, organization: 1, user: 1 },
    {
      name: 'idx_agent_workflows_user_created',
      partialFilterExpression: { isDeleted: false },
    },
  );

  return schema;
}

@Module({
  controllers: [AgentWorkflowsController],
  exports: [AgentWorkflowsService],
  imports: [
    MongooseModule.forFeatureAsync(
      [{ name: AgentWorkflow.name, useFactory: createAgentWorkflowSchema }],
      DB_CONNECTIONS.AGENT,
    ),
  ],
  providers: [AgentWorkflowsService],
})
export class AgentWorkflowsModule {}
