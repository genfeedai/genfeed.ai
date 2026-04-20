/**
 * Agent Messages Module
 * Stores individual agent chat messages in a separate collection
 * instead of embedding them in the AgentRoom document.
 */
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [AgentMessagesService],
  imports: [],
  providers: [AgentMessagesService],
})
export class AgentMessagesModule {}
