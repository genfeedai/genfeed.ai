import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { XaiService } from '@api/services/integrations/xai/services/xai.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(XaiService, {
  additionalImports: [OpenRouterModule],
});

@Module({
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class XaiModule {}
