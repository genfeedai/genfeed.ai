/**
 * Agent Runs Module
 * Tracks every agent execution as a first-class, queryable record.
 * Replaces embedded runHistory on AgentStrategy with org-scoped run documents.
 */

import { AgentRunsCoreModule } from '@api/collections/agent-runs/agent-runs-core.module';
import { AgentRunsController } from '@api/collections/agent-runs/controllers/agent-runs.controller';
import { AgentRunsOperationsController } from '@api/collections/agent-runs/controllers/agent-runs-operations.controller';
import { ThreadRunsController } from '@api/collections/agent-runs/controllers/thread-runs.controller';
import { AgentRunsOperationsService } from '@api/collections/agent-runs/services/agent-runs-operations.service';
import { QueuesModule } from '@api/queues/core/queues.module';
import { AgentThreadingCoreModule } from '@api/services/agent-threading/agent-threading-core.module';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { SERVER_TOKENS } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    AgentRunsController,
    AgentRunsOperationsController,
    ThreadRunsController,
  ],
  exports: [AgentRunsCoreModule],
  imports: [AgentRunsCoreModule, AgentThreadingCoreModule, QueuesModule],
  providers: [
    AgentRunsOperationsService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class AgentRunsModule {}
