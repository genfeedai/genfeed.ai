import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(OpenRouterService, {
  additionalImports: [HttpModule],
});

@Module({
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class OpenRouterModule {}
