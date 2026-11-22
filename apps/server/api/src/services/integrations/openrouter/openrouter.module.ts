import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { OpenRouterBoundedTextService } from '@api/services/integrations/openrouter/services/openrouter-bounded-text.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(OpenRouterService, {
  additionalImports: [
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
  ],
});

@Module({
  exports: [...(BaseModule.exports ?? []), OpenRouterBoundedTextService],
  imports: BaseModule.imports,
  providers: [...(BaseModule.providers ?? []), OpenRouterBoundedTextService],
})
export class OpenRouterModule {}
