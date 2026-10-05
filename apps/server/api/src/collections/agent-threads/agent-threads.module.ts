/**
 * Agent Conversations Module
 * Stores agent chat threads (rooms) for AI-powered agent interactions.
 * Messages are stored separately in the AgentMessagesModule.
 */

import { AgentMessagesModule } from '@api/collections/agent-messages/agent-messages.module';
import { AgentOnboardingKickoffController } from '@api/collections/agent-threads/controllers/agent-onboarding-kickoff.controller';
import { AgentRunsController } from '@api/collections/agent-threads/controllers/agent-runs.controller';
import { AgentThreadsController } from '@api/collections/agent-threads/controllers/agent-threads.controller';
import { AgentOnboardingKickoffService } from '@api/collections/agent-threads/services/agent-onboarding-kickoff.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { UsersCoreModule } from '@api/collections/users/users-core.module';
import { AgentScopeContextService, SERVER_TOKENS } from '@api/index';
import { AgentThreadProjectorService } from '@api/services/agent-threading/services/agent-thread-projector.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    AgentRunsController,
    AgentThreadsController,
    AgentOnboardingKickoffController,
  ],
  exports: [AgentScopeContextService, AgentThreadsService],
  imports: [AgentMessagesModule, UsersCoreModule],
  providers: [
    AgentThreadsService,
    AgentOnboardingKickoffService,
    AgentThreadProjectorService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
    {
      inject: [PrismaService, LoggerService],
      provide: AgentScopeContextService,
      useFactory: (prisma: PrismaService, logger: LoggerService) =>
        new AgentScopeContextService(prisma, logger),
    },
  ],
})
export class AgentThreadsModule {}
