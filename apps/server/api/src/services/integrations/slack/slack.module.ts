import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { SlackController } from '@api/services/integrations/slack/controllers/slack.controller';
import { SlackService } from '@api/services/integrations/slack/services/slack.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(SlackService, {
  additionalImports: [HttpModule, BrandsModule, CredentialsCoreModule],
});

@Module({
  controllers: [SlackController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class SlackModule {}
