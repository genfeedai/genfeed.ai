/**
 * Telegram Bot Module
 *
 * NestJS module for the GenFeed workflow execution bot.
 * Separate from the existing TelegramModule (social auth integration).
 */
import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { RunsModule } from '@api/collections/runs/runs.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FalModule } from '@api/services/integrations/fal/fal.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { TelegramBotController } from '@api/services/telegram-bot/telegram-bot.controller';
import { TelegramBotService } from '@api/services/telegram-bot/telegram-bot.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [TelegramBotController],
  exports: [TelegramBotService],
  imports: [
    forwardRef(() => ApiKeysModule),
    forwardRef(() => ConfigModule),
    forwardRef(() => FalModule),
    forwardRef(() => FilesClientModule),
    forwardRef(() => LoggerModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => RunsModule),
  ],
  providers: [TelegramBotService],
})
export class TelegramBotModule {}
