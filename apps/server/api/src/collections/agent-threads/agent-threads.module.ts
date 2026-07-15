/**
 * Agent Conversations Module
 * Stores agent chat threads (rooms) for AI-powered agent interactions.
 * Messages are stored separately in the AgentMessagesModule.
 */

import { AgentMessagesModule } from '@api/collections/agent-messages/agent-messages.module';
import { AgentThreadsController } from '@api/collections/agent-threads/controllers/agent-threads.controller';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { UsersModule } from '@api/collections/users/users.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AgentScopeContextService, SERVER_TOKENS } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [AgentThreadsController],
  exports: [AgentScopeContextService, AgentThreadsService],
  imports: [
    forwardRef(() => AgentMessagesModule),
    forwardRef(() => UsersModule),
  ],
  providers: [
    AgentScopeContextService,
    AgentThreadsService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class AgentThreadsModule {}
