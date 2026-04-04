import { Module } from '@nestjs/common';
import { ChatBotService } from '@notifications/services/chatbot/chatbot.service';
import { GenFeedModule } from '@notifications/services/genfeed/genfeed.module';
import { SharedModule } from '@notifications/shared/shared.module';

@Module({
  exports: [ChatBotService],
  imports: [GenFeedModule, SharedModule],
  providers: [ChatBotService],
})
export class ChatBotModule {}
