import { TelegramBotApiService } from '@api/services/integrations/telegram/services/telegram-bot-api.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [TelegramBotApiService],
  imports: [HttpModule],
  providers: [TelegramBotApiService],
})
export class TelegramBotApiModule {}
