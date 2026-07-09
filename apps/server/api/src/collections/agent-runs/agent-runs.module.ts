/**
 * Agent Runs Module
 * Tracks every agent execution as a first-class, queryable record.
 * Replaces embedded runHistory on AgentStrategy with org-scoped run documents.
 */
import { AgentRunsController } from '@api/collections/agent-runs/controllers/agent-runs.controller';
import { ThreadRunsController } from '@api/collections/agent-runs/controllers/thread-runs.controller';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { QueuesModule } from '@api/queues/core/queues.module';
import { AgentThreadingModule } from '@api/services/agent-threading/agent-threading.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [AgentRunsController, ThreadRunsController],
  exports: [AgentRunsService],
  imports: [
    forwardRef(() => AgentThreadingModule),
    forwardRef(() => QueuesModule),
  ],
  providers: [AgentRunsService],
})
export class AgentRunsModule {}
