import { ApiKeyHelperModule } from '@api/services/api-key/api-key-helper.module';
import { HedraController } from '@api/services/integrations/hedra/controllers/hedra.controller';
import { HedraService } from '@api/services/integrations/hedra/services/hedra.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(HedraService, {
  additionalImports: [HttpModule, ApiKeyHelperModule],
});

@Module({
  controllers: [HedraController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class HedraModule {}
