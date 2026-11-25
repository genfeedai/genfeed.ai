import { CustomerInstancesModule } from '@api/collections/customer-instances/customer-instances.module';
import { AgentChatModelRegistryModule } from '@api/services/agent-orchestrator/agent-chat-model-registry.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { AnthropicModule } from '@api/services/integrations/anthropic/anthropic.module';
import { DedicatedTextRouteService } from '@api/services/integrations/llm/dedicated-text-route.service';
import { LlmCompletionTelemetryService } from '@api/services/integrations/llm/llm-completion-telemetry.service';
import { LlmCostSettlementQueueService } from '@api/services/integrations/llm/llm-cost-settlement-queue.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { LlmVendorCostLedgerService } from '@api/services/integrations/llm/llm-vendor-cost-ledger.service';
import { OpenAiLlmModule } from '@api/services/integrations/openai-llm/openai-llm.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { createServiceModule } from '@api/shared/service-module.factory';
import { LLM_COST_SETTLEMENT_QUEUE } from '@genfeedai/contracts/queue';
import { BullModule } from '@nestjs/bullmq';

export const LlmDispatcherModule = createServiceModule(LlmDispatcherService, {
  additionalExports: [
    LlmCompletionTelemetryService,
    LlmVendorCostLedgerService,
  ],
  additionalImports: [
    BullModule.registerQueue({ name: LLM_COST_SETTLEMENT_QUEUE }),
    AnthropicModule,
    OpenAiLlmModule,
    OpenRouterModule,
    ByokModule,
    CustomerInstancesModule,
    AgentChatModelRegistryModule,
  ],
  additionalProviders: [
    DedicatedTextRouteService,
    LlmCostSettlementQueueService,
    LlmCompletionTelemetryService,
    LlmVendorCostLedgerService,
  ],
});
