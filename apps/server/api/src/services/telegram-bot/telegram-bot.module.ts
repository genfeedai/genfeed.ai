/**
 * Telegram Bot Module
 *
 * NestJS module for the GenFeed workflow execution bot.
 * Separate from the existing TelegramModule (social auth integration).
 */
import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { TelegramBotController } from '@api/services/telegram-bot/telegram-bot.controller';
import { TelegramBotService } from '@api/services/telegram-bot/telegram-bot.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [TelegramBotController],
  exports: [TelegramBotService],
  imports: [
    ApiKeysModule,
    ConfigModule,
    FilesClientModule,
    LoggerModule,
    WorkflowsModule,
  ],
  providers: [TelegramBotService],
})
export class TelegramBotModule {}
