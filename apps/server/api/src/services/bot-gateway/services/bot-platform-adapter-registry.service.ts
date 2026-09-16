import { DiscordBotAdapter } from '@api/services/bot-gateway/adapters/discord-bot.adapter';
import { SlackBotAdapter } from '@api/services/bot-gateway/adapters/slack-bot.adapter';
import { TelegramBotAdapter } from '@api/services/bot-gateway/adapters/telegram-bot.adapter';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { IBotPlatformAdapter } from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

/**
 * Maps a bot platform to the adapter that speaks its API. Shared by the
 * interaction gateway and the generation-callback responder so both resolve
 * adapters from one place.
 */
@Injectable()
export class BotPlatformAdapterRegistryService {
  private readonly adapters: Map<CredentialPlatform, IBotPlatformAdapter>;

  constructor(
    private readonly discordAdapter: DiscordBotAdapter,
    private readonly slackAdapter: SlackBotAdapter,
    private readonly telegramAdapter: TelegramBotAdapter,
  ) {
    this.adapters = new Map();
    this.adapters.set(CredentialPlatform.DISCORD, this.discordAdapter);
    this.adapters.set(CredentialPlatform.SLACK, this.slackAdapter);
    this.adapters.set(CredentialPlatform.TELEGRAM, this.telegramAdapter);
  }

  getAdapter(platform: CredentialPlatform): IBotPlatformAdapter | undefined {
    return this.adapters.get(platform);
  }
}
