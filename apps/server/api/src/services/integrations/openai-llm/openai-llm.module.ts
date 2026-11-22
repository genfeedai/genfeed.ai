import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { ByokModule } from '@api/services/byok/byok.module';
import { OpenAiOAuthController } from '@api/services/integrations/openai-llm/controllers/openai-oauth.controller';
import { OpenAiLlmService } from '@api/services/integrations/openai-llm/services/openai-llm.service';
import { OpenAiOAuthService } from '@api/services/integrations/openai-llm/services/openai-oauth.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(OpenAiLlmService, {
  additionalExports: [OpenAiOAuthService],
  additionalImports: [
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    ByokModule,
  ],
  additionalProviders: [OpenAiOAuthService],
});

@Module({
  controllers: [OpenAiOAuthController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class OpenAiLlmModule {}
