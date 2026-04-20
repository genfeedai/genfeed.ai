/**
 * Agent Conversations Module
 * Stores agent chat threads (rooms) for AI-powered agent interactions.
 * Messages are stored separately in the AgentMessagesModule.
 */

import { AgentMessagesModule } from '@api/collections/agent-messages/agent-messages.module';
import { AgentThreadsController } from '@api/collections/agent-threads/controllers/agent-threads.controller';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { UsersModule } from '@api/collections/users/users.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AgentThreadsController],
  exports: [AgentThreadsService],
  imports: [AgentMessagesModule, UsersModule],
  providers: [AgentThreadsService],
})
export class AgentThreadsModule {}
