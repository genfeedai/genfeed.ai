/**
 * Owns the authenticated organization/user context attached to Telegram chats.
 * Product operations are executed only by TelegramWorkflowRunnerService.
 */

import type { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import type { ChatAuthContext } from '@api/services/telegram-bot/telegram-bot.types';
import { extractCommandArgs } from '@api/services/telegram-bot/telegram-command-args.util';
import { ParseMode } from '@genfeedai/enums';
import type { Context } from 'grammy';

export class TelegramAuthContextService {
  private readonly chatAuthContexts = new Map<number, ChatAuthContext>();
  private defaultAuthContext: ChatAuthContext | null = null;

  constructor(private readonly apiKeysService?: ApiKeysService) {}

  setDefaultAuthContext(context: ChatAuthContext | null): void {
    this.defaultAuthContext = context;
  }

  hasDefaultContext(): boolean {
    return this.defaultAuthContext !== null;
  }

  getConnectedChatCount(): number {
    return this.chatAuthContexts.size;
  }

  resolveAuthContext(chatId: number): ChatAuthContext | null {
    return this.chatAuthContexts.get(chatId) ?? this.defaultAuthContext;
  }

  /**
   * Re-check a cached API-key chat identity against `findActiveById` so a
   * revoked or expired key cannot keep running workflows until `/connect`.
   */
  async resolveLiveAuthContext(
    chatId: number,
  ): Promise<ChatAuthContext | null> {
    const cached = this.resolveAuthContext(chatId);
    if (!cached) {
      return null;
    }

    if (cached.authType !== 'api_key' || !cached.apiKeyId) {
      return cached;
    }

    if (!this.apiKeysService) {
      this.dropApiKeyContext(chatId, cached.apiKeyId);
      return null;
    }

    const live = await this.apiKeysService.findActiveById(cached.apiKeyId);
    if (!live) {
      this.dropApiKeyContext(chatId, cached.apiKeyId);
      return null;
    }

    const next: ChatAuthContext = {
      apiKeyId: live.id,
      authType: 'api_key',
      organizationId: live.organizationId,
      scopes: live.scopes ?? [],
      userId: live.userId,
    };

    if (this.chatAuthContexts.has(chatId)) {
      this.chatAuthContexts.set(chatId, next);
    } else {
      this.defaultAuthContext = next;
    }

    return next;
  }

  private dropApiKeyContext(chatId: number, apiKeyId: string): void {
    this.chatAuthContexts.delete(chatId);
    if (this.defaultAuthContext?.apiKeyId === apiKeyId) {
      this.defaultAuthContext = null;
    }
  }

  /** Attach a verified API-key identity to a private Telegram chat. */
  async handleConnect(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    const args = extractCommandArgs(ctx);

    if (args.toLowerCase() === 'disconnect') {
      this.chatAuthContexts.delete(chatId);
      await ctx.reply('🔌 Disconnected API key context for this chat.');
      return;
    }

    if (args.toLowerCase() === 'default' && this.defaultAuthContext) {
      this.chatAuthContexts.delete(chatId);
      await ctx.reply(
        '✅ Switched this chat back to default org/user context.',
      );
      return;
    }

    if (!args) {
      await ctx.reply(
        'Usage: `/connect <api_key>`\n' +
          'Optional: `/connect disconnect` to clear chat key context.',
        { parse_mode: ParseMode.MARKDOWN },
      );
      return;
    }

    if (ctx.chat?.type !== 'private') {
      await ctx.reply(
        '🔒 For your security, connect an API key in a direct message with the bot, not in a group chat.',
      );
      return;
    }

    if (!this.apiKeysService) {
      await ctx.reply('⚠️ API key verification service is unavailable.');
      return;
    }

    try {
      await ctx.deleteMessage();
    } catch {
      // Best-effort: the bot may not have permission to delete the message.
    }

    const apiKeyRaw = args.split(/\s+/)[0];
    if (!apiKeyRaw.startsWith('gf_')) {
      await ctx.reply('❌ Invalid key format. Keys must start with `gf_`.');
      return;
    }

    const apiKey = await this.apiKeysService.findByKey(apiKeyRaw);
    if (!apiKey) {
      await ctx.reply('❌ Invalid or expired API key.');
      return;
    }

    this.chatAuthContexts.set(chatId, {
      apiKeyId: apiKey.id,
      authType: 'api_key',
      organizationId: apiKey.organizationId,
      scopes: apiKey.scopes ?? [],
      userId: apiKey.userId,
    });

    await ctx.reply(
      `✅ Connected.\n` +
        `🏢 Org: ${apiKey.organizationId}\n` +
        `👤 User: ${apiKey.userId}\n` +
        `🔐 Scopes: ${(apiKey.scopes || []).slice(0, 8).join(', ') || 'none'}`,
    );
  }
}
