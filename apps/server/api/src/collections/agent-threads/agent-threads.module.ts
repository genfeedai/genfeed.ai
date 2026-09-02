/**
 * Agent Conversations Module
 * Stores agent chat threads (rooms) for AI-powered agent interactions.
 * Messages are stored separately in the AgentMessagesModule.
 */

import { AgentMessagesModule } from '@api/collections/agent-messages/agent-messages.module';
import { AgentThreadsController } from '@api/collections/agent-threads/controllers/agent-threads.controller';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { UsersCoreModule } from '@api/collections/users/users-core.module';
import { AgentScopeContextService, SERVER_TOKENS } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AgentThreadsController],
  exports: [AgentScopeContextService, AgentThreadsService],
  imports: [AgentMessagesModule, UsersCoreModule],
  providers: [
    AgentThreadsService,
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
