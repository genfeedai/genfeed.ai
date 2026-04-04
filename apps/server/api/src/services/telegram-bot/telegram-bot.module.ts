/**
 * Telegram Bot Module
 *
 * NestJS module for the GenFeed workflow execution bot.
 * Separate from the existing TelegramModule (social auth integration).
 */
import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { RunsModule } from '@api/collections/runs/runs.module';
import { ConfigModule } from '@api/config/config.module';
import { FalModule } from '@api/services/integrations/fal/fal.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { TelegramBotController } from '@api/services/telegram-bot/telegram-bot.controller';
import { TelegramBotService } from '@api/services/telegram-bot/telegram-bot.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [TelegramBotController],
  exports: [TelegramBotService],
  imports: [
    ApiKeysModule,
    ConfigModule,
    FalModule,
    LoggerModule,
    ReplicateModule,
    RunsModule,
  ],
  providers: [TelegramBotService],
})
export class TelegramBotModule {}
