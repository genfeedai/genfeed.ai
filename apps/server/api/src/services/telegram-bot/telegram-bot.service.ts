/**
 * Telegram Bot Service
 *
 * Workflow execution bot using grammy. Allows users to browse and execute
 * GenFeed workflows via Telegram with conversational input collection.
 * Wired to the real WorkflowEngine for actual execution via Replicate.
 *
 * Separate from the existing TelegramService (social auth integration).
 *
 * This service owns the bot lifecycle and transport (polling/webhook) and wires
 * handlers to its collaborators:
 *  - {@link TelegramRunCommandsService} — run control-plane commands + auth
 *  - {@link TelegramConversationService} — conversational workflow runner
 *  - {@link TelegramWorkflowRunnerService} — workflow execution + results
 */

import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { RunsService } from '@api/collections/runs/services/runs.service';
import {
  TELEGRAM_BOT_CONSTANTS,
  TELEGRAM_BOT_ENV,
} from '@api/services/telegram-bot/telegram-bot.constants';
import type { WorkflowJson } from '@api/services/telegram-bot/telegram-bot.types';
import { extractCommandArgs } from '@api/services/telegram-bot/telegram-command-args.util';
import { TelegramConversationService } from '@api/services/telegram-bot/telegram-conversation.service';
import { TelegramMessageHandlerService } from '@api/services/telegram-bot/telegram-message-handler.service';
import { TelegramRunCommandsService } from '@api/services/telegram-bot/telegram-run-commands.service';
import { registerWorkflowExecutors } from '@api/services/telegram-bot/telegram-workflow-executors';
import { loadTelegramWorkflows } from '@api/services/telegram-bot/telegram-workflow-loader';
import { TelegramWorkflowRunnerService } from '@api/services/telegram-bot/telegram-workflow-runner.service';
import { ParseMode, RunAuthType } from '@genfeedai/enums';
import {
  createWorkflowEngine,
  type WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { FalService } from '@server/services/integrations/fal/services/fal.service';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import { Bot, type Context } from 'grammy';

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private bot: Bot | null = null;
  private allowedUserIds: Set<number> = new Set();
  private isRunning = false;
  private engine: WorkflowEngine | null = null;

  private readonly runCommands: TelegramRunCommandsService;
  private readonly runner: TelegramWorkflowRunnerService;
  private readonly conversation: TelegramConversationService;
  private readonly messageHandler: TelegramMessageHandlerService;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly replicateService: ReplicateService,
    @Optional() private readonly falService?: FalService,
    @Optional() private readonly runsService?: RunsService,
    @Optional() private readonly apiKeysService?: ApiKeysService,
    @Optional() private readonly filesClientService?: FilesClientService,
  ) {
    this.runCommands = new TelegramRunCommandsService(
      this.loggerService,
      this.runsService,
      this.apiKeysService,
    );
    this.runner = new TelegramWorkflowRunnerService(
      this.loggerService,
      (chatId) => this.runCommands.resolveAuthContext(chatId),
    );
    this.conversation = new TelegramConversationService(
      this.loggerService,
      this.runner,
    );
    this.messageHandler = new TelegramMessageHandlerService(
      this.loggerService,
      this.conversation,
      this.runCommands,
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

    const defaultOrganizationId = this.configService.get(
      TELEGRAM_BOT_ENV.DEFAULT_ORGANIZATION_ID,
    );
    const defaultUserId = this.configService.get(
      TELEGRAM_BOT_ENV.DEFAULT_USER_ID,
    );
    if (defaultOrganizationId && defaultUserId) {
      this.runCommands.setDefaultAuthContext({
        authType: RunAuthType.BETTER_AUTH,
        organizationId: String(defaultOrganizationId),
        userId: String(defaultUserId),
      });
      this.loggerService.log(
        'TelegramBotService: default org/user context enabled for run commands',
      );
    }

    // Load workflows
    await this.loadWorkflows();

    // Initialize workflow engine with executors
    this.initializeEngine();

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

  /** Initialize the WorkflowEngine with executors for each node type. */
  private initializeEngine() {
    this.engine = createWorkflowEngine({
      maxConcurrency: 1,
      retryConfig: {
        backoffMultiplier: 2,
        baseDelayMs: 2000,
        maxDelayMs: 30000,
        maxRetries: 2,
      },
    });

    registerWorkflowExecutors(this.engine, {
      falService: this.falService,
      loggerService: this.loggerService,
      replicateService: this.replicateService,
    });

    this.conversation.attachEngine(this.engine);
  }

  /** Load workflow JSONs from the core workflows package. */
  private async loadWorkflows() {
    const workflows = await loadTelegramWorkflows(this.loggerService);
    this.conversation.setWorkflows(workflows);
  }

  /** Check if a user is authorized to use the bot. */
  private isAuthorized(userId: number): boolean {
    if (this.allowedUserIds.size === 0) {
      return true;
    }
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

    // Run control-plane commands
    this.bot.command(COMMANDS.CONNECT, (ctx) =>
      this.runCommands.handleConnect(ctx),
    );
    this.bot.command(COMMANDS.GENERATE, (ctx) =>
      this.handleGenerateCommand(ctx),
    );
    this.bot.command(COMMANDS.POST, (ctx) => this.handlePostCommand(ctx));
    this.bot.command(COMMANDS.ANALYTICS, (ctx) =>
      this.runCommands.runAnalytics(ctx, extractCommandArgs(ctx)),
    );
    this.bot.command(COMMANDS.RUN, (ctx) =>
      this.runCommands.runComposite(ctx, extractCommandArgs(ctx)),
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

    // /status - bot or run status
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

  /** /generate - generate content, optionally from a pending reference image. */
  private async handleGenerateCommand(ctx: Context): Promise<void> {
    const prompt = extractCommandArgs(ctx);
    if (!prompt) {
      await ctx.reply('Usage: `/generate <prompt>`', {
        parse_mode: ParseMode.MARKDOWN,
      });
      return;
    }

    const chatId = ctx.chat?.id;
    const pendingImageUrl =
      typeof chatId === 'number'
        ? this.conversation.takePendingImage(chatId)
        : undefined;

    await this.runCommands.runGenerate(ctx, { pendingImageUrl, prompt });
  }

  /** /post - publish content. */
  private async handlePostCommand(ctx: Context): Promise<void> {
    const postInput = extractCommandArgs(ctx);
    if (!postInput) {
      await ctx.reply('Usage: `/post <content|asset_id|draft_id>`', {
        parse_mode: ParseMode.MARKDOWN,
      });
      return;
    }

    await this.runCommands.runPost(ctx, postInput);
  }

  /** /status - report bot status, or a specific run's status when given an id. */
  private async handleStatusCommand(ctx: Context): Promise<void> {
    const args = extractCommandArgs(ctx);
    if (args) {
      await this.runCommands.getRunStatus(ctx, args);
      return;
    }

    const chatId = ctx.chat?.id;
    const { statusLine, hasPendingImage } =
      this.conversation.describeStatus(chatId);
    const connectedContext = chatId
      ? this.runCommands.resolveAuthContext(chatId)
      : null;

    await ctx.reply(
      `🤖 GenFeed Bot\n` +
        `📦 Workflows loaded: ${this.conversation.workflowsLoaded()}\n` +
        `💬 Active conversations: ${this.conversation.getActiveCount()}\n` +
        `🖼 Pending image prompt: ${
          chatId ? (hasPendingImage ? 'yes' : 'no') : 'n/a'
        }\n` +
        `🔐 Chat context: ${
          connectedContext
            ? `${connectedContext.authType} (${connectedContext.organizationId})`
            : 'not connected'
        }\n` +
        `🔧 Engine: ${this.engine ? 'Ready' : 'Not initialized'}\n` +
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
      allowedUsers: this.allowedUserIds.size || 'all',
      connectedChats: this.runCommands.getConnectedChatCount(),
      engineReady: !!this.engine,
      hasDefaultContext: this.runCommands.hasDefaultContext(),
      running: this.isRunning,
      workflowsLoaded: this.conversation.workflowsLoaded(),
    };
  }

  /** Get loaded workflows for external use. */
  getWorkflows(): Map<string, WorkflowJson> {
    return this.conversation.getWorkflows();
  }
}
