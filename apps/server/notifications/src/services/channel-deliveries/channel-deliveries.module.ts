import { Module } from '@nestjs/common';
import { InternalApiKeyGuard } from '@notifications/guards/internal-api-key.guard';
import { ChannelDeliveriesController } from '@notifications/services/channel-deliveries/channel-deliveries.controller';
import { ChannelMessageDispatcherService } from '@notifications/services/channel-deliveries/channel-message-dispatcher.service';
import { DiscordModule } from '@notifications/services/discord/discord.module';
import { ResendModule } from '@notifications/services/resend/resend.module';
import { SlackNotificationModule } from '@notifications/services/slack/slack.module';
import { TelegramModule } from '@notifications/services/telegram/telegram.module';
import { SharedModule } from '@notifications/shared/shared.module';

@Module({
  controllers: [ChannelDeliveriesController],
  exports: [ChannelMessageDispatcherService],
  imports: [
    DiscordModule,
    ResendModule,
    SharedModule,
    SlackNotificationModule,
    TelegramModule,
  ],
  providers: [ChannelMessageDispatcherService, InternalApiKeyGuard],
})
export class ChannelDeliveriesModule {}
