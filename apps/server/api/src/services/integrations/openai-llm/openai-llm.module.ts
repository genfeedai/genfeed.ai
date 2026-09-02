import { ByokModule } from '@api/services/byok/byok.module';
import { OpenAiOAuthController } from '@api/services/integrations/openai-llm/controllers/openai-oauth.controller';
import { OpenAiLlmService } from '@api/services/integrations/openai-llm/services/openai-llm.service';
import { OpenAiOAuthService } from '@api/services/integrations/openai-llm/services/openai-oauth.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(OpenAiLlmService, {
  additionalExports: [OpenAiOAuthService],
  additionalImports: [HttpModule, ByokModule],
  additionalProviders: [OpenAiOAuthService],
});

@Module({
  controllers: [OpenAiOAuthController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class OpenAiLlmModule {}
