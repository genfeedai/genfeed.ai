import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { DiscordController } from '@api/services/integrations/discord/controllers/discord.controller';
import { DiscordService } from '@api/services/integrations/discord/services/discord.service';
import { DiscordWebhookService } from '@api/services/integrations/discord/services/discord-webhook.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  controllers: [DiscordController],
  exports: [DiscordService, DiscordWebhookService],
  imports: [
    BrandsModule,
    ConfigModule,
    CredentialsCoreModule,
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    LoggerModule,
  ],
  providers: [DiscordService, DiscordWebhookService],
})
export class DiscordModule {}
