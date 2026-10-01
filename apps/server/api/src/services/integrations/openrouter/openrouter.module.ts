import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { OpenRouterBoundedTextService } from '@api/services/integrations/openrouter/services/openrouter-bounded-text.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(OpenRouterService, {
  additionalImports: [HttpModule],
});

@Module({
  exports: [...(BaseModule.exports ?? []), OpenRouterBoundedTextService],
  imports: BaseModule.imports,
  providers: [...(BaseModule.providers ?? []), OpenRouterBoundedTextService],
})
export class OpenRouterModule {}
