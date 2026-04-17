import { AgentWorkflowsController } from '@api/workflows/agent-workflows.controller';
import { AgentWorkflowsService } from '@api/workflows/agent-workflows.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AgentWorkflowsController],
  exports: [AgentWorkflowsService],
  providers: [AgentWorkflowsService],
})
export class AgentWorkflowsModule {}
