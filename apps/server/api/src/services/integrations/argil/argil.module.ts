import { ByokModule } from '@api/services/byok/byok.module';
import { ArgilController } from '@api/services/integrations/argil/controllers/argil.controller';
import { ArgilService } from '@api/services/integrations/argil/services/argil.service';
import { ArgilWebhookTokenService } from '@api/services/integrations/argil/services/argil-webhook-token.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(ArgilService, {
  additionalExports: [ArgilWebhookTokenService],
  additionalImports: [HttpModule, ByokModule],
  additionalProviders: [ArgilWebhookTokenService],
});

@Module({
  controllers: [ArgilController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class ArgilModule {}
