import { EventsModule } from '@libs/events/events.module';
import { HealthModule } from '@libs/health/health.module';
import { RedisModule } from '@libs/redis/redis.module';
import { WebSocketModule } from '@libs/websockets/websockets.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@notifications/config/config.module';
import { ConfigService } from '@notifications/config/config.service';
import { DevDiscordController } from '@notifications/controllers/dev.controller';
import { ChatBotModule } from '@notifications/services/chatbot/chatbot.module';
import { DiscordModule } from '@notifications/services/discord/discord.module';
import { GenFeedModule } from '@notifications/services/genfeed/genfeed.module';
import { NotificationHandlerService } from '@notifications/services/notification-handler.service';
import { ResendModule } from '@notifications/services/resend/resend.module';
import { SlackNotificationModule } from '@notifications/services/slack/slack.module';
import { TelegramModule } from '@notifications/services/telegram/telegram.module';
import { TerminalModule } from '@notifications/services/terminal/terminal.module';
import { SharedModule } from '@notifications/shared/shared.module';
import { WebhooksModule } from '@notifications/webhooks/webhooks.module';

@Module({
  controllers: [DevDiscordController],
  imports: [
    ConfigModule,
    SharedModule,

    HealthModule,
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
    EventsModule,
    WebSocketModule,
    WebhooksModule,
    GenFeedModule,
    ChatBotModule,
    TerminalModule,

    // Services
    DiscordModule,
    ResendModule,
    SlackNotificationModule,
    TelegramModule,
  ],
  providers: [NotificationHandlerService],
})
export class AppModule {}
