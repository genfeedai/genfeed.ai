import { Module } from '@nestjs/common';
import { TelegramService } from '@notifications/services/telegram/telegram.service';
import { SharedModule } from '@notifications/shared/shared.module';

@Module({
  exports: [TelegramService],
  imports: [SharedModule],
  providers: [TelegramService],
})
export class TelegramModule {}
