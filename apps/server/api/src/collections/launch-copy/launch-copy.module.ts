import { BrandsModule } from '@api/collections/brands/brands.module';
import { LaunchCopyController } from '@api/collections/launch-copy/controllers/launch-copy.controller';
import { LaunchCopyGeneratorService } from '@api/collections/launch-copy/services/launch-copy-generator.service';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { createServiceModule } from '@api/shared/service-module.factory';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(LaunchCopyGeneratorService, {
  additionalImports: [
    forwardRef(() => BrandsModule),
    forwardRef(() => LlmDispatcherModule),
  ],
});

@Module({
  controllers: [LaunchCopyController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class LaunchCopyModule {}
