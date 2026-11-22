import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { TelegramBotApiService } from '@api/services/integrations/telegram/services/telegram-bot-api.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [TelegramBotApiService],
  imports: [HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS })],
  providers: [TelegramBotApiService],
})
export class TelegramBotApiModule {}
