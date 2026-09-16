import { DiscordBotAdapter } from '@api/services/bot-gateway/adapters/discord-bot.adapter';
import { SlackBotAdapter } from '@api/services/bot-gateway/adapters/slack-bot.adapter';
import { TelegramBotAdapter } from '@api/services/bot-gateway/adapters/telegram-bot.adapter';
import { BotCallbackContextService } from '@api/services/bot-gateway/services/bot-callback-context.service';
import { BotCallbackResponderService } from '@api/services/bot-gateway/services/bot-callback-responder.service';
import { BotPlatformAdapterRegistryService } from '@api/services/bot-gateway/services/bot-platform-adapter-registry.service';
import { ConfigModule } from '@libs/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

/**
 * Leaf slice of the bot gateway: the platform adapters, the Redis-backed
 * callback store, and the responder that answers a bot interaction once its
 * generation finishes. The webhook media path imports this instead of
 * `BotGatewayModule`, whose generation dispatcher reaches back into the
 * images/videos/musics modules. Nothing here may import a collection module.
 */
@Module({
  exports: [
    BotCallbackContextService,
    BotCallbackResponderService,
    BotPlatformAdapterRegistryService,
    DiscordBotAdapter,
    SlackBotAdapter,
    TelegramBotAdapter,
  ],
  imports: [ConfigModule, HttpModule],
  providers: [
    BotCallbackContextService,
    BotCallbackResponderService,
    BotPlatformAdapterRegistryService,
    DiscordBotAdapter,
    SlackBotAdapter,
    TelegramBotAdapter,
  ],
})
export class BotCallbackModule {}
