import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { ByokModule } from '@api/services/byok/byok.module';
import { AnthropicModule } from '@api/services/integrations/anthropic/anthropic.module';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { LlmInstanceService } from '@api/services/integrations/llm/llm-instance.service';
import { OpenAiLlmModule } from '@api/services/integrations/openai-llm/openai-llm.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { createServiceModule } from '@api/shared/service-module.factory';
import { PollUntilModule } from '@api/shared/services/poll-until/poll-until.module';
import { RedisModule } from '@libs/redis/redis.module';
import type { Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(LlmDispatcherService, {
  additionalImports: [
    AnthropicModule,
    OpenAiLlmModule,
    OpenRouterModule,
    ByokModule,
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
