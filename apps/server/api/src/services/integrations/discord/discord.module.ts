import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { DiscordController } from '@api/services/integrations/discord/controllers/discord.controller';
import { DiscordService } from '@api/services/integrations/discord/services/discord.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  controllers: [DiscordController],
  exports: [DiscordService],
  imports: [
    BrandsModule,
    ConfigModule,
    CredentialsCoreModule,
    HttpModule,
    LoggerModule,
  ],
  providers: [DiscordService],
})
export class DiscordModule {}
