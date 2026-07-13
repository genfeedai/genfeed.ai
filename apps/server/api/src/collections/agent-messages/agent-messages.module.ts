/**
 * Agent Messages Module
 * Stores individual agent chat messages in a separate collection
 * instead of embedding them in the AgentRoom document.
 */
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentArtifactReferenceService,
  SERVER_TOKENS,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [AgentMessagesService],
  imports: [],
  providers: [
    AgentArtifactReferenceService,
    AgentMessagesService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class AgentMessagesModule {}
