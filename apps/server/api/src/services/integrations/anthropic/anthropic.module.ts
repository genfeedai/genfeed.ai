import { AnthropicService } from '@api/services/integrations/anthropic/services/anthropic.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(AnthropicService);

@Module({
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class AnthropicModule {}
