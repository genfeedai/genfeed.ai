import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { SnapchatController } from '@api/services/integrations/snapchat/controllers/snapchat.controller';
import { SnapchatService } from '@api/services/integrations/snapchat/services/snapchat.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(SnapchatService, {
  additionalImports: [HttpModule, forwardRef(() => CredentialsCoreModule)],
});

@Module({
  controllers: [SnapchatController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class SnapchatModule {}
