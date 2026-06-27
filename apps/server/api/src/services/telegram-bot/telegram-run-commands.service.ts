/**
 * Telegram Run-Commands Service
 *
 * Owns the run control-plane surface of the Telegram bot: per-chat auth
 * context, scope checks, and the omnichannel commands (/connect, /generate,
 * /post, /analytics, /run, and /status <run_id>). Extracted from
 * TelegramBotService so run/auth concerns live behind one collaborator.
 */

import type { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import type { RunsService } from '@api/collections/runs/services/runs.service';
import type { ChatAuthContext } from '@api/services/telegram-bot/telegram-bot.types';
import { extractCommandArgs } from '@api/services/telegram-bot/telegram-command-args.util';
import {
  ApiKeyScope,
  ParseMode,
  RunActionType,
  RunAuthType,
  RunSurface,
  RunTrigger,
} from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Context } from 'grammy';

/** Build the redundant image-reference fan-out used by generate runs. */
function buildImageFanout(imageUrl: string): Record<string, string> {
  return {
    image: imageUrl,
    imageUrl,
    referenceImageUrl: imageUrl,
    sourceImageUrl: imageUrl,
  };
}

export class TelegramRunCommandsService {
  private readonly chatAuthContexts: Map<number, ChatAuthContext> = new Map();
  private defaultAuthContext: ChatAuthContext | null = null;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly runsService?: RunsService,
    private readonly apiKeysService?: ApiKeysService,
  ) {}

  setDefaultAuthContext(context: ChatAuthContext | null): void {
    this.defaultAuthContext = context;
  }

  hasDefaultContext(): boolean {
    return !!this.defaultAuthContext;
  }

  getConnectedChatCount(): number {
    return this.chatAuthContexts.size;
  }

  resolveAuthContext(chatId: number): ChatAuthContext | null {
    return this.chatAuthContexts.get(chatId) ?? this.defaultAuthContext;
  }

  private hasRequiredScopes(
    authContext: ChatAuthContext,
    scopes: ApiKeyScope[],
  ): boolean {
    if (
      scopes.length === 0 ||
      authContext.authType === RunAuthType.BETTER_AUTH
    ) {
      return true;
    }

    const availableScopes = authContext.scopes ?? [];
    if (
      availableScopes.includes(ApiKeyScope.ADMIN) ||
      availableScopes.includes('*')
    ) {
      return true;
    }

    return scopes.every((scope) => availableScopes.includes(scope));
  }

  private async resolveRunCommandContext(
    ctx: Context,
    scopes: ApiKeyScope[] = [],
  ): Promise<{ chatId: number; authContext: ChatAuthContext } | null> {
    if (!this.runsService) {
      await ctx.reply('⚠️ Run control plane is currently unavailable.');
      return null;
    }

    const chatId = ctx.chat?.id;
    if (!chatId) {
      return null;
    }

    const authContext = this.resolveAuthContext(chatId);
    if (!authContext) {
      await ctx.reply(
        '🔐 Connect first with `/connect <api_key>` or configure default org/user context.',
        { parse_mode: ParseMode.MARKDOWN },
      );
      return null;
    }

    if (!this.hasRequiredScopes(authContext, scopes)) {
      await ctx.reply(
        '⛔ Your connected API key does not have the required scopes for this command.',
      );
      return null;
    }

    return { authContext, chatId };
  }

  private runIdFromDocument(run: unknown): string {
    if (!run || typeof run !== 'object') {
      return '';
    }

    const runRecord = run as Record<string, unknown>;
    return String(runRecord._id ?? runRecord.id ?? '');
  }

  private async createAndExecuteRun(
    ctx: Context,
    actionType: RunActionType,
    input: Record<string, unknown>,
    scopes: ApiKeyScope[] = [],
  ) {
    const runsService = this.runsService;
    if (!runsService) {
      await ctx.reply('⚠️ Run control plane is currently unavailable.');
      return;
    }

    const resolved = await this.resolveRunCommandContext(ctx, scopes);
    if (!resolved) {
      return;
    }

    const { chatId, authContext } = resolved;
    const commandArgs = extractCommandArgs(ctx);

    const metadata: Record<string, unknown> = {
      chatId,
      command: actionType,
      telegramUserId: ctx.from?.id,
      username: ctx.from?.username,
    };
    if (commandArgs) {
      metadata.commandArgs = commandArgs;
    }

    try {
      const { reused, run } = await runsService.createRun(
        authContext.userId,
        authContext.organizationId,
        authContext.authType,
        {
          actionType,
          correlationId: `tg:${chatId}:${Date.now()}`,
          input,
          metadata,
          surface: RunSurface.TG,
          trigger: RunTrigger.MANUAL,
        },
      );

      const runId = this.runIdFromDocument(run);
      const executedRun = runId
        ? await runsService.executeRun(runId, authContext.organizationId)
        : null;
      const runStatus =
        run && typeof run === 'object' && 'status' in run
          ? String((run as { status: unknown }).status)
          : 'pending';
      const status = executedRun?.status ?? runStatus;

      await ctx.reply(
        `✅ ${actionType.toUpperCase()} run ${reused ? 'reused' : 'started'}\n` +
          `🆔 ${runId || 'unknown'}\n` +
          `📊 Status: ${status}\n\n` +
          `Use /status ${runId || '<run_id>'} for progress.`,
      );
    } catch (error: unknown) {
      this.loggerService.error('TelegramBotService: failed to create run', {
        actionType,
        error,
      });
      await ctx.reply(
        `❌ Failed to start ${actionType} run: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  /** /connect - attach org/user context via API key */
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

    if (!this.apiKeysService) {
      await ctx.reply('⚠️ API key verification service is unavailable.');
      return;
    }

    // Delete the user's message to prevent API key exposure in chat history
    try {
      await ctx.deleteMessage();
    } catch {
      // Best-effort: may fail if bot lacks delete permissions
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
      authType: RunAuthType.API_KEY,
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

  /** /generate - generate content, optionally from a pending reference image */
  async runGenerate(
    ctx: Context,
    options: { prompt: string; pendingImageUrl?: string },
  ): Promise<void> {
    const input: Record<string, unknown> = { prompt: options.prompt };
    if (options.pendingImageUrl) {
      Object.assign(input, buildImageFanout(options.pendingImageUrl));
    }

    await this.createAndExecuteRun(ctx, RunActionType.GENERATE, input, [
      ApiKeyScope.VIDEOS_CREATE,
      ApiKeyScope.IMAGES_CREATE,
    ]);
  }

  /** /post - publish content */
  async runPost(ctx: Context, postInput: string): Promise<void> {
    await this.createAndExecuteRun(
      ctx,
      RunActionType.POST,
      { payload: postInput },
      [ApiKeyScope.POSTS_CREATE],
    );
  }

  /** /analytics - fetch analytics */
  async runAnalytics(ctx: Context, target: string): Promise<void> {
    await this.createAndExecuteRun(
      ctx,
      RunActionType.ANALYTICS,
      { target: target || 'account' },
      [ApiKeyScope.ANALYTICS_READ],
    );
  }

  /** /run - composite generate → post → analytics */
  async runComposite(ctx: Context, prompt: string): Promise<void> {
    await this.createAndExecuteRun(
      ctx,
      RunActionType.COMPOSITE,
      {
        mode: 'generate-post-analytics',
        ...(prompt ? { prompt } : {}),
      },
      [
        ApiKeyScope.VIDEOS_CREATE,
        ApiKeyScope.IMAGES_CREATE,
        ApiKeyScope.POSTS_CREATE,
        ApiKeyScope.ANALYTICS_READ,
      ],
    );
  }

  /** /status <run_id> - report a specific run's status */
  async getRunStatus(ctx: Context, runId: string): Promise<void> {
    const runsService = this.runsService;
    if (!runsService) {
      await ctx.reply('⚠️ Run control plane is currently unavailable.');
      return;
    }

    const resolved = await this.resolveRunCommandContext(ctx, [
      ApiKeyScope.VIDEOS_READ,
      ApiKeyScope.IMAGES_READ,
      ApiKeyScope.ANALYTICS_READ,
    ]);
    if (!resolved) {
      return;
    }

    const run = await runsService.getRun(
      runId,
      resolved.authContext.organizationId,
    );
    if (!run) {
      await ctx.reply(`❌ Run not found: ${runId}`);
      return;
    }

    const latestEvent = run.events?.[run.events.length - 1];
    const resolvedRunId = this.runIdFromDocument(run);
    await ctx.reply(
      `🧾 Run ${resolvedRunId}\n` +
        `🎯 Action: ${run.actionType}\n` +
        `📍 Surface: ${run.surface}\n` +
        `📊 Status: ${run.status}\n` +
        `⏱ Progress: ${run.progress}%\n` +
        `🪪 Trigger: ${run.trigger}\n` +
        (latestEvent ? `📝 Last event: ${latestEvent.type}` : ''),
    );
  }
}
