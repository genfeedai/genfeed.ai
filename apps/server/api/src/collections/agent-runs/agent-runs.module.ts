/**
 * Agent Runs Module
 * Tracks every agent execution as a first-class, queryable record.
 * Replaces embedded runHistory on AgentStrategy with org-scoped run documents.
 */
import { AgentRunsController } from '@api/collections/agent-runs/controllers/agent-runs.controller';
import { ThreadRunsController } from '@api/collections/agent-runs/controllers/thread-runs.controller';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentThreadingModule } from '@api/services/agent-threading/agent-threading.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AgentRunsController, ThreadRunsController],
  exports: [AgentRunsService],
  imports: [AgentThreadingModule],
  providers: [AgentRunsService],
})
export class AgentRunsModule {}
