import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { TelegramController } from '@api/services/integrations/telegram/controllers/telegram.controller';
import { TelegramGroupConnectController } from '@api/services/integrations/telegram/controllers/telegram-group-connect.controller';
import { TelegramService } from '@api/services/integrations/telegram/services/telegram.service';
import { TelegramBotApiModule } from '@api/services/integrations/telegram/telegram-bot-api.module';
import { TelegramGroupLinkModule } from '@api/services/integrations/telegram/telegram-group-link.module';
import { createServiceModule } from '@api/shared/service-module.factory';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(TelegramService, {
  additionalImports: [
    BrandsModule,
    CredentialsCoreModule,
    TelegramBotApiModule,
    TelegramGroupLinkModule,
  ],
});

@Module({
  controllers: [TelegramController, TelegramGroupConnectController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class TelegramModule {}
