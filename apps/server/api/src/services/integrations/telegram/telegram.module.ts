import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { TelegramController } from '@api/services/integrations/telegram/controllers/telegram.controller';
import { TelegramService } from '@api/services/integrations/telegram/services/telegram.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(TelegramService, {
  additionalImports: [CredentialsCoreModule],
});

@Module({
  controllers: [TelegramController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class TelegramModule {}
