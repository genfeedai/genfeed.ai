import { ApiKeyHelperModule } from '@api/services/api-key/api-key-helper.module';
import { OpusProController } from '@api/services/integrations/opuspro/controllers/opuspro.controller';
import { OpusProService } from '@api/services/integrations/opuspro/services/opuspro.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(OpusProService, {
  additionalImports: [HttpModule, ApiKeyHelperModule],
});

@Module({
  controllers: [OpusProController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class OpusProModule {}
