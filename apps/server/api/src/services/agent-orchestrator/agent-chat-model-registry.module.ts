import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Shared runtime registry for agent-chat TEXT models (DB-backed).
 * Import this module wherever defaults, round costs, or key resolution
 * should read the seeded catalog instead of constants.
 */
@Module({
  exports: [AgentChatModelRegistryService],
  imports: [LoggerModule, PrismaModule],
  providers: [AgentChatModelRegistryService],
})
export class AgentChatModelRegistryModule {}
