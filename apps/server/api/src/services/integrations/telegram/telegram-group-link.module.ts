import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { TelegramGroupLinkService } from '@api/services/integrations/telegram/services/telegram-group-link.service';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [TelegramGroupLinkService],
  imports: [BrandsModule, ConfigModule, CredentialsCoreModule],
  providers: [TelegramGroupLinkService],
})
export class TelegramGroupLinkModule {}
