import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { TelegramController } from '@api/services/integrations/telegram/controllers/telegram.controller';
import { TelegramService } from '@api/services/integrations/telegram/services/telegram.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(TelegramService, {
  additionalImports: [forwardRef(() => CredentialsCoreModule)],
});

@Module({
  controllers: [TelegramController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class TelegramModule {}
