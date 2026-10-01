import { ApiKeyHelperModule } from '@api/services/api-key/api-key-helper.module';
import { HeyGenController } from '@api/services/integrations/heygen/controllers/heygen.controller';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { PollUntilModule } from '@api/shared/services/poll-until/poll-until.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(HeyGenService, {
  additionalImports: [HttpModule, ApiKeyHelperModule, PollUntilModule],
});

@Module({
  controllers: [HeyGenController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class HeyGenModule {}
