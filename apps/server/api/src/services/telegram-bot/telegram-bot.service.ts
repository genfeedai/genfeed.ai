/**
 * Telegram Bot Service
 *
 * Workflow execution bot using grammy. Allows users to browse and execute
 * GenFeed workflows via Telegram with conversational input collection.
 * Uses the shared immutable workflow engine and Genfeed action executors.
 *
 * Separate from the existing TelegramService (social auth integration).
 *
 * This service owns the bot lifecycle and transport (polling/webhook) and wires
 * handlers to its collaborators:
 *  - {@link TelegramAuthContextService} — per-chat authentication context
 *  - {@link TelegramConversationService} — conversational workflow runner
 *  - {@link TelegramWorkflowRunnerService} — workflow execution + results
 */

import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { TelegramAuthContextService } from '@api/services/telegram-bot/telegram-auth-context.service';
import {
  TELEGRAM_BOT_CONSTANTS,
  TELEGRAM_BOT_ENV,
} from '@api/services/telegram-bot/telegram-bot.constants';
import type { WorkflowJson } from '@api/services/telegram-bot/telegram-bot.types';
import { TelegramConversationService } from '@api/services/telegram-bot/telegram-conversation.service';
import { TelegramMessageHandlerService } from '@api/services/telegram-bot/telegram-message-handler.service';
import {
  loadTelegramWorkflows,
  toTelegramSystemWorkflowDefinition,
} from '@api/services/telegram-bot/telegram-workflow-loader';
import { TelegramWorkflowRunnerService } from '@api/services/telegram-bot/telegram-workflow-runner.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Bot, type Context } from 'grammy';

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private bot: Bot | null = null;
  private allowedUserIds: Set<number> = new Set();
  private isRunning = false;

  private readonly authContexts: TelegramAuthContextService;
  private readonly runner: TelegramWorkflowRunnerService;
  private readonly conversation: TelegramConversationService;
  private readonly messageHandler: TelegramMessageHandlerService;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    private readonly prisma: PrismaService,
    @Optional() private readonly apiKeysService?: ApiKeysService,
    @Optional() private readonly filesClientService?: FilesClientService,
  ) {
    this.authContexts = new TelegramAuthContextService(this.apiKeysService);
    this.runner = new TelegramWorkflowRunnerService(
      this.loggerService,
      this.systemWorkflowRunner,
      this.prisma,
      (chatId) => this.authContexts.resolveLiveAuthContext(chatId),
    );
    this.conversation = new TelegramConversationService(this.runner);
    this.messageHandler = new TelegramMessageHandlerService(
      this.loggerService,
      this.conversation,
      this.filesClientService,
    );
  }

  async onModuleInit() {
    const token = this.configService.get(TELEGRAM_BOT_ENV.TOKEN);
    if (!token) {
      this.loggerService.warn(
        'TelegramBotService: TELEGRAM_BOT_TOKEN not set, bot disabled',
      );
      return;
    }

    const mode = String(
      this.configService.get(TELEGRAM_BOT_ENV.MODE) || 'polling',
    );
    if (mode === 'polling' && !this.configService.isDevTelegramPollingEnabled) {
      this.loggerService.log(
        'TelegramBotService: polling disabled for local development',
      );
      return;
    }

    // Parse allowed user IDs
    const allowedIds = this.configService.get(
      TELEGRAM_BOT_ENV.ALLOWED_USER_IDS,
    );
    if (allowedIds) {
      for (const id of String(allowedIds).split(',')) {
        const parsed = parseInt(id.trim(), 10);
        if (!Number.isNaN(parsed)) {
          this.allowedUserIds.add(parsed);
        }
      }
    }

    if (this.allowedUserIds.size === 0) {
      this.loggerService.warn(
        `TelegramBotService: a bot token is configured but ${TELEGRAM_BOT_ENV.ALLOWED_USER_IDS} names no user, so every command will be refused. Set it to the comma-separated Telegram user ids allowed to drive this bot.`,
      );
    }

    const defaultOrganizationId = this.configService.get(
      TELEGRAM_BOT_ENV.DEFAULT_ORGANIZATION_ID,
    );
    const defaultUserId = this.configService.get(
      TELEGRAM_BOT_ENV.DEFAULT_USER_ID,
    );
    if (defaultOrganizationId && defaultUserId) {
      this.authContexts.setDefaultAuthContext({
        authType: 'better_auth',
        organizationId: String(defaultOrganizationId),
        userId: String(defaultUserId),
      });
      this.loggerService.log(
        'TelegramBotService: default org/user context enabled for workflows',
      );
    }

    // Load workflows
    await this.loadWorkflows();

    // Create bot
    this.bot = new Bot(String(token));
    this.messageHandler.setBotToken(String(token));
    this.setupHandlers();

    // Start based on mode
    if (mode === 'polling') {
      this.startPolling();
    }
    // Webhook mode is handled by the controller
  }

  onModuleDestroy() {
    this.stopBot();
  }

  /** Load action-backed recipes and register hidden system workflows. */
  private async loadWorkflows() {
    const workflows = await loadTelegramWorkflows(this.loggerService);
    for (const [workflowId, workflow] of workflows) {
      this.systemWorkflowRunner.registerWorkflow(
        toTelegramSystemWorkflowDefinition(workflowId, workflow),
      );
    }
    this.conversation.setWorkflows(workflows);
  }

  /**
   * Check if a user is authorized to use the bot.
   *
   * An unconfigured allowlist denies everyone. The bot spends the deployment's
   * credits and can reach its workflow runners, so an operator who provisions a
   * token without naming the users is treated as having named nobody.
   */
  private isAuthorized(userId: number): boolean {
    return this.allowedUserIds.has(userId);
  }

  /** Wire bot command, callback, and message handlers to the collaborators. */
  private setupHandlers() {
    if (!this.bot) {
      return;
    }

    const { COMMANDS } = TELEGRAM_BOT_CONSTANTS;

    // Authorization middleware
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (!userId || !this.isAuthorized(userId)) {
        await ctx.reply('⛔ You are not authorized to use this bot.');
        return;
      }
      await next();
    });

    this.bot.command(COMMANDS.CONNECT, (ctx) =>
      this.authContexts.handleConnect(ctx),
    );

    // /start and /workflows - list available workflows
    this.bot.command([COMMANDS.START, COMMANDS.WORKFLOWS], async (ctx) => {
      const chatId = ctx.chat?.id;
      if (chatId && this.conversation.isExecuting(chatId)) {
        await ctx.reply(
          '⏳ A workflow is currently running. Please wait for it to finish or use /cancel.',
        );
        return;
      }
      await this.conversation.handleWorkflowList(ctx);
    });

    // /cancel - cancel current conversation
    this.bot.command(COMMANDS.CANCEL, (ctx) =>
      this.conversation.handleCancelCommand(ctx),
    );

    // /status - workflow bot status for this chat
    this.bot.command(COMMANDS.STATUS, (ctx) => this.handleStatusCommand(ctx));

    // Callback queries (inline keyboard buttons)
    this.bot.on('callback_query:data', (ctx) =>
      this.conversation.handleCallbackQuery(ctx),
    );

    // Photo messages (for image inputs)
    this.bot.on('message:photo', (ctx) => this.messageHandler.handlePhoto(ctx));

    // Audio/video messages (for workflow media inputs)
    this.bot.on('message:audio', (ctx) => this.messageHandler.handleAudio(ctx));
    this.bot.on('message:voice', (ctx) => this.messageHandler.handleAudio(ctx));
    this.bot.on('message:video', (ctx) => this.messageHandler.handleVideo(ctx));
    this.bot.on('message:document', (ctx) =>
      this.messageHandler.handleDocument(ctx),
    );

    // Text messages (for prompt/text inputs)
    this.bot.on('message:text', (ctx) => this.messageHandler.handleText(ctx));
  }

  /** /status - report workflow-bot status for this chat. */
  private async handleStatusCommand(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const { statusLine } = this.conversation.describeStatus(chatId);
    const connectedContext = chatId
      ? await this.authContexts.resolveLiveAuthContext(chatId)
      : null;

    await ctx.reply(
      `🤖 GenFeed Bot\n` +
        `📦 Workflows loaded: ${this.conversation.workflowsLoaded()}\n` +
        `💬 Active conversations: ${this.conversation.getActiveCount()}\n` +
        `🔐 Chat context: ${
          connectedContext
            ? `${connectedContext.authType} (${connectedContext.organizationId})`
            : 'not connected'
        }\n` +
        `🔧 Workflow engine: Shared\n` +
        `📍 Your status: ${statusLine}\n` +
        `✅ Status: Running`,
    );
  }

  /** Start bot in polling mode (for development). */
  private startPolling() {
    if (!this.bot || this.isRunning) {
      return;
    }

    try {
      this.isRunning = true;
      this.bot.start({
        onStart: () => {
          this.loggerService.log(
            'TelegramBotService: Bot started (polling mode)',
          );
        },
      });
    } catch (error) {
      this.isRunning = false;
      this.loggerService.error('TelegramBotService: Failed to start polling', {
        error,
      });
    }
  }

  /** Stop the bot. */
  stopBot() {
    if (this.bot && this.isRunning) {
      this.bot.stop();
      this.isRunning = false;
      this.loggerService.log('TelegramBotService: Bot stopped');
    }
  }

  /** Handle incoming webhook update (for production). */
  async handleWebhookUpdate(update: unknown) {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }
    await this.bot.handleUpdate(update as Parameters<Bot['handleUpdate']>[0]);
  }

  /** Get bot status info. */
  getStatus() {
    return {
      activeConversations: this.conversation.getActiveCount(),
      allowedUsers: this.allowedUserIds.size,
      connectedChats: this.authContexts.getConnectedChatCount(),
      engineReady: this.conversation.workflowsLoaded() > 0,
      hasDefaultContext: this.authContexts.hasDefaultContext(),
      running: this.isRunning,
      workflowsLoaded: this.conversation.workflowsLoaded(),
    };
  }

  /** Get loaded workflows for external use. */
  getWorkflows(): Map<string, WorkflowJson> {
    return this.conversation.getWorkflows();
  }
}
