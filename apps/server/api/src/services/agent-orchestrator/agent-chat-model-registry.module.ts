import { OrganizationPaidAccessModule } from '@api/common/subscriptions/organization-paid-access.module';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { AgentModelAccessService } from '@api/services/agent-orchestrator/agent-model-access.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Shared runtime registry for agent-chat TEXT models (DB-backed).
 * Import this module wherever defaults, round costs, or key resolution
 * should read the seeded catalog instead of constants. Also owns the
 * free-tier agent model lock, so every consumer of model resolution can
 * enforce it.
 */
@Module({
  exports: [AgentChatModelRegistryService, AgentModelAccessService],
  imports: [LoggerModule, OrganizationPaidAccessModule, PrismaModule],
  providers: [AgentChatModelRegistryService, AgentModelAccessService],
})
export class AgentChatModelRegistryModule {}
