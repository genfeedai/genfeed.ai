import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { ConfigModule } from '@api/config/config.module';
import { DiscordController } from '@api/services/integrations/discord/controllers/discord.controller';
import { DiscordService } from '@api/services/integrations/discord/services/discord.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [DiscordController],
  exports: [DiscordService],
  imports: [
    ConfigModule,
    forwardRef(() => CredentialsModule),
    HttpModule,
    LoggerModule,
  ],
  providers: [DiscordService],
})
export class DiscordModule {}
