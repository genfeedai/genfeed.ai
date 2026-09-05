import { ByokModule } from '@api/services/byok/byok.module';
import { AnthropicModule } from '@api/services/integrations/anthropic/anthropic.module';
import { LlmCompletionTelemetryService } from '@api/services/integrations/llm/llm-completion-telemetry.service';
import { LlmCostSettlementQueueService } from '@api/services/integrations/llm/llm-cost-settlement-queue.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { LlmInstanceService } from '@api/services/integrations/llm/llm-instance.service';
import { LlmVendorCostLedgerService } from '@api/services/integrations/llm/llm-vendor-cost-ledger.service';
import { OpenAiLlmModule } from '@api/services/integrations/openai-llm/openai-llm.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { createServiceModule } from '@api/shared/service-module.factory';
import { PollUntilModule } from '@api/shared/services/poll-until/poll-until.module';
import { LLM_COST_SETTLEMENT_QUEUE } from '@genfeedai/contracts/queue';
import { ConfigModule } from '@libs/config/config.module';
import { ConfigService } from '@libs/config/config.service';
import { RedisModule } from '@libs/redis/redis.module';
import { BullModule } from '@nestjs/bullmq';
import type { Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(LlmDispatcherService, {
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
  ],
  additionalProviders: [
    LlmCostSettlementQueueService,
    LlmCompletionTelemetryService,
    LlmVendorCostLedgerService,
  ],
});

@Module({
  exports: [...(BaseModule.exports ?? []), LlmInstanceService],
  imports: [
    ...(BaseModule.imports ?? []),
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
    PollUntilModule,
  ],
  providers: [
    ...((BaseModule.providers ?? []) as Provider[]),
    LlmInstanceService,
  ],
})
export class LlmDispatcherModule {}
