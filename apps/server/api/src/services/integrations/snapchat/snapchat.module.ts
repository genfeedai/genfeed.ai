import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { SnapchatController } from '@api/services/integrations/snapchat/controllers/snapchat.controller';
import { SnapchatService } from '@api/services/integrations/snapchat/services/snapchat.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(SnapchatService, {
  additionalImports: [HttpModule, CredentialsCoreModule],
});

@Module({
  controllers: [SnapchatController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class SnapchatModule {}
