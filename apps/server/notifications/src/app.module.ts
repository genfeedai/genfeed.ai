import { EventsModule } from '@libs/events/events.module';
import { HealthModule } from '@libs/health/health.module';
import { RedisModule } from '@libs/redis/redis.module';
import { WebSocketModule } from '@libs/websockets/websockets.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@notifications/config/config.module';
import { ConfigService } from '@notifications/config/config.service';
import { DevModule } from '@notifications/controllers/dev.module';
import { ChannelDeliveriesModule } from '@notifications/services/channel-deliveries/channel-deliveries.module';
import { ChatBotModule } from '@notifications/services/chatbot/chatbot.module';
import { DiscordModule } from '@notifications/services/discord/discord.module';
import { GenFeedModule } from '@notifications/services/genfeed/genfeed.module';
import { ResendModule } from '@notifications/services/resend/resend.module';
import { SlackNotificationModule } from '@notifications/services/slack/slack.module';
import { TelegramModule } from '@notifications/services/telegram/telegram.module';
import { TerminalModule } from '@notifications/services/terminal/terminal.module';
import { SharedModule } from '@notifications/shared/shared.module';
import { WebhooksModule } from '@notifications/webhooks/webhooks.module';

@Module({
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
    ChannelDeliveriesModule,
    DiscordModule,
    ResendModule,
    SlackNotificationModule,
    TelegramModule,
    // Decided at import time, before ConfigService exists; mirrors the API's
    // DevModule gate. An unset NODE_ENV (the self-hosted image) excludes it.
    ...(process.env.NODE_ENV === 'development' ? [DevModule] : []),
  ],
})
export class AppModule {}
