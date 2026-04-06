import { ParseMode } from '@genfeedai/enums';
import {
  BaseBotManager,
  extractWorkflowExecutionSnapshot,
  extractWorkflowOutputsFromExecution,
  IMAGE_MODELS,
  IntegrationEvent,
  isWorkflowExecutionTerminalStatus,
  OrgIntegration,
  REDIS_EVENTS,
  UserSettings,
  VIDEO_MODELS,
  WorkflowInput,
  WorkflowSession,
} from '@genfeedai/integrations';
import { RedisService } from '@libs/redis/redis.service';
import { HttpService } from '@nestjs/axios';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@telegram/config/config.service';
import { Bot, type Context, InlineKeyboard } from 'grammy';
import { firstValueFrom } from 'rxjs';

interface TelegramBotInstance {
  id: string;
  orgId: string;
  bot: Bot;
  integration: OrgIntegration;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  nodes?: Record<string, WorkflowNode>;
}

interface WorkflowNode {
  type: string;
  data?: {
    label?: string;
    inputType?: 'text' | 'image';
    defaultValue?: string;
    required?: boolean;
  };
}

@Injectable()
export class TelegramBotManager
  extends BaseBotManager<TelegramBotInstance>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly platform = 'telegram' as const;
  private readonly integrationEvents = [
    REDIS_EVENTS.INTEGRATION_CREATED,
    REDIS_EVENTS.INTEGRATION_UPDATED,
    REDIS_EVENTS.INTEGRATION_DELETED,
  ] as const;
  private readonly workflowExecutionPollIntervalMs = 2000;
  private readonly workflowExecutionPollTimeoutMs = 300000;
  private redisSubscribed = false;
  private readonly sessions = new Map<string, WorkflowSession>();
  private readonly userSettings = new Map<string, UserSettings>();

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  async onModuleInit() {
    await this.initialize();
  }

  async onModuleDestroy() {
    await this.shutdown();
  }

  async initialize(): Promise<void> {
    this.logger.log('Initializing Telegram Bot Manager');

    try {
      await this.subscribeToIntegrationEvents();
      const integrations = await this.fetchActiveIntegrations();

      for (const integration of integrations) {
        await this.addIntegration(integration);
      }

      this.logger.log(
        `Telegram Bot Manager initialized with ${this.getActiveCount()} bots`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize Telegram Bot Manager:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.logger.log('Shutting down Telegram Bot Manager');

    await this.unsubscribeFromIntegrationEvents();

    for (const [, botInstance] of this.bots.entries()) {
      await this.destroyBotInstance(botInstance);
    }

    this.bots.clear();
    this.sessions.clear();
    this.userSettings.clear();
  }

  createBotInstance(integration: OrgIntegration): Promise<TelegramBotInstance> {
    const bot = new Bot(integration.botToken);

    this.setupBotHandlers(bot, integration);

    bot.start().catch((error) => {
      this.logger.error(`Failed to start bot ${integration.id}:`, error);
    });

    return Promise.resolve({
      bot,
      id: integration.id,
      integration,
      orgId: integration.orgId,
    });
  }

  async destroyBotInstance(botInstance: TelegramBotInstance): Promise<void> {
    try {
      await botInstance.bot.stop();
    } catch (error) {
      this.logger.error(`Error stopping bot ${botInstance.id}`, error);
    }
  }

  private setupBotHandlers(bot: Bot, integration: OrgIntegration) {
    const orgId = integration.orgId;
    const allowedUserIds = integration.config.allowedUserIds || [];

    // Auth middleware
    bot.use(async (ctx, next) => {
      const userId = ctx.from?.id?.toString();
      if (
        allowedUserIds.length > 0 &&
        (!userId || !allowedUserIds.includes(userId))
      ) {
        await ctx.reply('You are not authorized to use this bot.');
        return;
      }
      await next();
    });

    bot.command('start', async (ctx) => {
      await ctx.reply(
        '*GenFeed AI Bot*\n\n' +
          'Generate images & videos using AI workflows.\n\n' +
          '*Commands:*\n' +
          '/workflows - Browse & run workflows\n' +
          '/settings - Configure model preferences\n' +
          '/status - Check current workflow status\n' +
          '/cancel - Cancel current workflow',
        { parse_mode: ParseMode.MARKDOWN },
      );
    });

    bot.command('workflows', async (ctx) => {
      await this.handleWorkflowsCommand(ctx, orgId);
    });

    bot.command('status', async (ctx) => {
      await this.handleStatusCommand(ctx);
    });

    bot.command('cancel', async (ctx) => {
      await this.handleCancelCommand(ctx);
    });

    bot.command('settings', async (ctx) => {
      await this.handleSettingsCommand(ctx);
    });

    bot.on('callback_query:data', async (ctx) => {
      await this.handleCallbackQuery(ctx, orgId);
    });

    bot.on('message:text', async (ctx) => {
      await this.handleTextMessage(ctx, orgId);
    });

    bot.on('message:photo', async (ctx) => {
      await this.handlePhotoMessage(ctx, orgId);
    });

    bot.catch((err) => {
      this.logger.error(`Error in bot ${integration.id}:`, err);
    });
  }

  private async handleWorkflowsCommand(ctx: Context, orgId: string) {
    const chatId = ctx.chat?.id?.toString();
    if (!chatId) {
      return;
    }

    const session = this.getSession(chatId);
    if (session?.state === 'running') {
      await ctx.reply(
        'A workflow is running. Use /status to check progress or /cancel to abort.',
      );
      return;
    }

    try {
      const workflows = await this.fetchOrgWorkflows(orgId);

      if (workflows.length === 0) {
        await ctx.reply('No workflows available for your organization.');
        return;
      }

      const keyboard = new InlineKeyboard();
      for (const workflow of workflows) {
        keyboard.text(workflow.name, `wf:${workflow.id}`).row();
      }

      this.setSession(chatId, {
        collectedInputs: new Map(),
        currentInputIndex: 0,
        orgId,
        requiredInputs: [],
        startedAt: Date.now(),
        state: 'selecting',
      });

      await ctx.reply('*GenFeed AI Workflows*\n\nSelect a workflow to run:', {
        parse_mode: ParseMode.MARKDOWN,
        reply_markup: keyboard,
      });
    } catch (error) {
      this.logger.error('Failed to fetch workflows:', error);
      await ctx.reply('Failed to load workflows. Please try again.');
    }
  }

  private async handleStatusCommand(ctx: Context) {
    const chatId = ctx.chat?.id?.toString();
    if (!chatId) {
      return;
    }

    const session = this.getSession(chatId);

    let line = 'Idle - no active workflow';
    if (session) {
      const elapsed = this.formatDuration(Date.now() - session.startedAt);
      switch (session.state) {
        case 'selecting':
          line = 'Selecting a workflow';
          break;
        case 'collecting':
          line = `Collecting inputs (${session.currentInputIndex}/${session.requiredInputs.length}) - ${elapsed}`;
          break;
        case 'confirming':
          line = `Waiting for confirmation - ${elapsed}`;
          break;
        case 'running':
          line = `Running *${session.workflowName}* - ${elapsed}`;
          if (session.executionId && session.orgId) {
            try {
              const execution = await this.getWorkflowExecution(
                session.orgId,
                session.executionId,
              );
              if (execution.status) {
                line = `Running *${session.workflowName}* (${execution.status}) - ${elapsed}`;
              }
            } catch (error) {
              this.logger.warn('Failed to fetch workflow execution status', {
                error,
                executionId: session.executionId,
              });
            }
          }
          break;
      }
    }

    await ctx.reply(`*GenFeed Bot Status*\n\nYour status: ${line}`, {
      parse_mode: ParseMode.MARKDOWN,
    });
  }

  private async handleCancelCommand(ctx: Context) {
    const chatId = ctx.chat?.id?.toString();
    if (!chatId) {
      return;
    }

    const session = this.getSession(chatId);
    if (!session || session.state === 'idle') {
      await ctx.reply('Nothing to cancel.');
      return;
    }

    if (session.executionId && session.orgId) {
      try {
        await this.cancelWorkflowExecution(session.orgId, session.executionId);
      } catch (error) {
        this.logger.warn('Failed to cancel workflow execution', {
          error,
          executionId: session.executionId,
        });
      }
    }

    this.deleteSession(chatId);
    await ctx.reply('Cancelled. Use /workflows to start again.');
  }

  private async handleSettingsCommand(ctx: Context) {
    const chatId = ctx.chat?.id?.toString();
    if (!chatId) {
      return;
    }

    const session = this.getSession(chatId);
    if (session?.state === 'running') {
      await ctx.reply(
        'A workflow is running. Use /status to check progress or /cancel to abort.',
      );
      return;
    }

    await this.showSettingsMenu(ctx, chatId);
  }

  private async handleCallbackQuery(ctx: Context, orgId: string) {
    const data = ctx.callbackQuery?.data;
    const chatId = ctx.chat?.id?.toString();
    if (!data || !chatId) {
      return;
    }

    await ctx.answerCallbackQuery();

    if (data.startsWith('wf:')) {
      const workflowId = data.slice(3);
      await this.selectWorkflow(ctx, chatId, orgId, workflowId);
    } else if (data === 'confirm:run') {
      await this.handleRun(ctx, chatId, orgId);
    } else if (data === 'confirm:edit') {
      await this.handleEdit(ctx, chatId);
    } else if (data === 'confirm:cancel') {
      this.deleteSession(chatId);
      await ctx.reply('Cancelled. Use /workflows to start again.');
    } else if (data.startsWith('cfg:img:')) {
      const model = data.slice(8);
      const settings = this.userSettings.get(chatId) || {
        imageModel: IMAGE_MODELS[0],
        videoModel: VIDEO_MODELS[0],
      };
      settings.imageModel = model;
      this.userSettings.set(chatId, settings);
      await ctx.reply(`Image model set to: *${model}*`, {
        parse_mode: ParseMode.MARKDOWN,
      });
    } else if (data.startsWith('cfg:vid:')) {
      const model = data.slice(8);
      const settings = this.userSettings.get(chatId) || {
        imageModel: IMAGE_MODELS[0],
        videoModel: VIDEO_MODELS[0],
      };
      settings.videoModel = model;
      this.userSettings.set(chatId, settings);
      await ctx.reply(`Video model set to: *${model}*`, {
        parse_mode: ParseMode.MARKDOWN,
      });
    }
  }

  private async handleTextMessage(ctx: Context, _orgId: string) {
    const chatId = ctx.chat?.id?.toString();
    const text = ctx.message?.text;
    if (!chatId || !text || text.startsWith('/')) {
      return;
    }

    const session = this.getSession(chatId);
    if (!session || session.state !== 'collecting') {
      await ctx.reply('No active workflow. Use /workflows to start one.');
      return;
    }

    const currentInput = session.requiredInputs[session.currentInputIndex];
    if (!currentInput || currentInput.inputType !== 'text') {
      await ctx.reply("I'm expecting an image, not text. Please send a photo.");
      return;
    }

    let value = text;
    if (value.toLowerCase() === 'default' && currentInput.defaultValue) {
      value = currentInput.defaultValue;
    }

    session.collectedInputs.set(currentInput.nodeId, value);
    session.currentInputIndex++;
    this.setSession(chatId, session);

    await this.promptNextInput(ctx, chatId);
  }

  private async handlePhotoMessage(ctx: Context, _orgId: string) {
    const chatId = ctx.chat?.id?.toString();
    if (!chatId) {
      return;
    }

    const session = this.getSession(chatId);
    if (!session || session.state !== 'collecting') {
      await ctx.reply('No active input collection. Use /workflows to start.');
      return;
    }

    const currentInput = session.requiredInputs[session.currentInputIndex];
    if (!currentInput || currentInput.inputType !== 'image') {
      await ctx.reply(
        "I'm not expecting an image right now. Please send text.",
      );
      return;
    }

    try {
      const photos = ctx.message?.photo;
      if (!photos || photos.length === 0) {
        return;
      }

      const bestPhoto = photos[photos.length - 1];
      const file = await ctx.api.getFile(bestPhoto.file_id);

      const imageUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

      session.collectedInputs.set(currentInput.nodeId, imageUrl);
      session.currentInputIndex++;
      this.setSession(chatId, session);

      await this.promptNextInput(ctx, chatId);
    } catch (error) {
      this.logger.error('Failed to handle photo:', error);
      await ctx.reply('Failed to process the photo. Please try again.');
    }
  }

  // --- Session helpers ---

  private getSession(chatId: string): WorkflowSession | undefined {
    return this.sessions.get(chatId);
  }

  private setSession(chatId: string, session: WorkflowSession): void {
    this.sessions.set(chatId, session);
  }

  private deleteSession(chatId: string): void {
    this.sessions.delete(chatId);
  }

  private isIntegrationEvent(data: unknown): data is IntegrationEvent {
    return (
      typeof data === 'object' &&
      data !== null &&
      'integrationId' in data &&
      'platform' in data &&
      typeof (data as IntegrationEvent).integrationId === 'string' &&
      typeof (data as IntegrationEvent).platform === 'string'
    );
  }

  private async subscribeToIntegrationEvents(): Promise<void> {
    if (this.redisSubscribed) {
      return;
    }

    for (const event of this.integrationEvents) {
      await this.redisService.subscribe(event, (data: unknown) => {
        if (!this.isIntegrationEvent(data) || data.platform !== this.platform) {
          return;
        }
        this.handleRedisEvent(event, data).catch((err) =>
          this.logger.error('Failed to handle Redis integration event', err),
        );
      });
    }

    this.redisSubscribed = true;
    this.logger.log('Subscribed to Telegram integration Redis events');
  }

  private async unsubscribeFromIntegrationEvents(): Promise<void> {
    if (!this.redisSubscribed) {
      return;
    }

    const results = await Promise.allSettled(
      this.integrationEvents.map((event) =>
        this.redisService.unsubscribe(event),
      ),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn(
          'Failed to unsubscribe from one or more Redis channels',
          result.reason,
        );
      }
    }

    this.redisSubscribed = false;
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  // --- API fetch methods ---

  private normalizeIntegration(payload: unknown): OrgIntegration | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const raw = payload as Record<string, unknown>;
    const rawId = raw.id ?? raw._id;
    const rawOrgId = raw.orgId ?? raw.organization;
    const rawToken = raw.botToken;

    if (!rawId || !rawOrgId || !rawToken) {
      return null;
    }

    return {
      botToken: String(rawToken),
      config: (raw.config as OrgIntegration['config']) || {},
      createdAt: raw.createdAt ? new Date(raw.createdAt as string) : new Date(),
      id: String(rawId),
      orgId: String(rawOrgId),
      platform: this.platform,
      status: (raw.status as OrgIntegration['status'] | undefined) || 'active',
      updatedAt: raw.updatedAt ? new Date(raw.updatedAt as string) : new Date(),
    };
  }

  private normalizeIntegrations(payload: unknown): OrgIntegration[] {
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .map((integration) => this.normalizeIntegration(integration))
      .filter(
        (integration): integration is OrgIntegration => integration !== null,
      );
  }

  private async fetchActiveIntegrations(): Promise<OrgIntegration[]> {
    try {
      const apiKey = this.configService.API_KEY;
      if (!apiKey) {
        this.logger.warn(
          'API_KEY not configured; internal integrations request may fail',
        );
      }
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.configService.API_URL}/v1/internal/integrations/telegram`,
          {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
          },
        ),
      );
      return this.normalizeIntegrations(response.data);
    } catch (error) {
      this.logger.error('Failed to fetch integrations:', error);
      return [];
    }
  }

  protected async fetchAndAddIntegration(integrationId: string): Promise<void> {
    try {
      const apiKey = this.configService.API_KEY;
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.configService.API_URL}/v1/internal/integrations/telegram/${integrationId}`,
          {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
          },
        ),
      );
      const integration = this.normalizeIntegration(response.data);
      if (!integration) {
        this.logger.warn(
          `Unable to normalize Telegram integration payload: ${integrationId}`,
        );
        return;
      }
      await this.addIntegration(integration);
    } catch (error) {
      this.logger.error(
        `Failed to fetch and add integration ${integrationId}:`,
        error,
      );
    }
  }

  protected async fetchAndUpdateIntegration(
    integrationId: string,
  ): Promise<void> {
    try {
      const apiKey = this.configService.API_KEY;
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.configService.API_URL}/v1/internal/integrations/telegram/${integrationId}`,
          {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
          },
        ),
      );
      const integration = this.normalizeIntegration(response.data);
      if (!integration) {
        this.logger.warn(
          `Unable to normalize Telegram integration payload: ${integrationId}`,
        );
        return;
      }
      await this.updateIntegration(integration);
    } catch (error) {
      this.logger.error(
        `Failed to fetch and update integration ${integrationId}:`,
        error,
      );
    }
  }

  private async fetchOrgWorkflows(
    orgId: string,
  ): Promise<WorkflowDefinition[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.configService.API_URL}/v1/orgs/${orgId}/workflows`,
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch workflows:', error);
      return [];
    }
  }

  // --- Workflow methods ---

  private async selectWorkflow(
    ctx: Context,
    chatId: string,
    orgId: string,
    workflowId: string,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.configService.API_URL}/v1/orgs/${orgId}/workflows/${workflowId}`,
        ),
      );

      const workflow: WorkflowDefinition = response.data;
      const requiredInputs = this.extractWorkflowInputs(workflow);

      const session = this.getSession(chatId);
      if (!session) {
        return;
      }

      session.state = 'collecting';
      session.workflowId = workflowId;
      session.workflowName = workflow.name;
      session.requiredInputs = requiredInputs;
      session.currentInputIndex = 0;
      session.collectedInputs = new Map();
      this.setSession(chatId, session);

      await ctx.reply(
        `*${workflow.name}*\n\n` +
          `${workflow.description || 'No description'}\n\n` +
          `This workflow requires *${requiredInputs.length}* input(s).`,
        { parse_mode: ParseMode.MARKDOWN },
      );

      await this.promptNextInput(ctx, chatId);
    } catch (error) {
      this.logger.error('Failed to select workflow:', error);
      await ctx.reply('Failed to load workflow details. Please try again.');
    }
  }

  private extractWorkflowInputs(workflow: WorkflowDefinition): WorkflowInput[] {
    const inputs: WorkflowInput[] = [];

    if (!workflow.nodes) {
      return inputs;
    }

    for (const [nodeId, node] of Object.entries(workflow.nodes)) {
      if (node.type === 'input' && node.data) {
        inputs.push({
          defaultValue: node.data.defaultValue,
          inputType: node.data.inputType || 'text',
          label: node.data.label || nodeId,
          nodeId,
          required: node.data.required !== false,
        });
      }
    }

    return inputs;
  }

  private async promptNextInput(ctx: Context, chatId: string) {
    const session = this.getSession(chatId);
    if (!session) {
      return;
    }

    if (session.currentInputIndex >= session.requiredInputs.length) {
      await this.showConfirmation(ctx, chatId);
      return;
    }

    const input = session.requiredInputs[session.currentInputIndex];
    const position = `(${session.currentInputIndex + 1}/${session.requiredInputs.length})`;

    if (input.inputType === 'image') {
      await ctx.reply(
        `*Input ${position}:* ${input.label}\n\nPlease send a photo.`,
        { parse_mode: ParseMode.MARKDOWN },
      );
    } else {
      const defaultHint = input.defaultValue
        ? `\n\nDefault: \`${input.defaultValue}\` (type "default" to use it)`
        : '';
      await ctx.reply(
        `*Input ${position}:* ${input.label}\n\nPlease enter a text value.${defaultHint}`,
        { parse_mode: ParseMode.MARKDOWN },
      );
    }
  }

  private async showConfirmation(ctx: Context, chatId: string) {
    const session = this.getSession(chatId);
    if (!session) {
      return;
    }

    session.state = 'confirming';
    this.setSession(chatId, session);

    const lines = [`*Workflow:* ${session.workflowName}\n`];
    for (const input of session.requiredInputs) {
      const value = session.collectedInputs.get(input.nodeId) || '(empty)';
      const displayValue =
        input.inputType === 'image' ? '[Image uploaded]' : value;
      lines.push(`*${input.label}:* ${displayValue}`);
    }

    const keyboard = new InlineKeyboard()
      .text('Run', 'confirm:run')
      .text('Edit', 'confirm:edit')
      .text('Cancel', 'confirm:cancel');

    await ctx.reply(`*Review your inputs:*\n\n${lines.join('\n')}`, {
      parse_mode: ParseMode.MARKDOWN,
      reply_markup: keyboard,
    });
  }

  private async handleRun(ctx: Context, chatId: string, orgId: string) {
    const session = this.getSession(chatId);
    if (!session || !session.workflowId) {
      await ctx.reply('No workflow selected. Use /workflows to start.');
      return;
    }

    session.state = 'running';
    this.setSession(chatId, session);

    await ctx.reply(
      `Running *${session.workflowName}*...\n\nUse /status to check progress.`,
      { parse_mode: ParseMode.MARKDOWN },
    );

    try {
      const inputPayload: Record<string, string> = {};
      for (const [key, value] of session.collectedInputs.entries()) {
        inputPayload[key] = value;
      }

      const settings = this.userSettings.get(chatId);
      const metadata = settings
        ? {
            imageModel: settings.imageModel,
            videoModel: settings.videoModel,
          }
        : undefined;
      const executionId = await this.createWorkflowExecution(
        orgId,
        session.workflowId,
        inputPayload,
        metadata,
      );
      session.executionId = executionId;
      this.setSession(chatId, session);

      void this.monitorWorkflowExecution(orgId, chatId, ctx);
    } catch (error) {
      this.logger.error('Failed to execute workflow:', error);
      await ctx.reply(
        'Workflow execution failed. Please try again.\nUse /workflows to start a new run.',
      );
      this.deleteSession(chatId);
    }
  }

  private async handleEdit(ctx: Context, chatId: string) {
    const session = this.getSession(chatId);
    if (!session) {
      return;
    }

    session.currentInputIndex = 0;
    session.collectedInputs = new Map();
    session.state = 'collecting';
    this.setSession(chatId, session);

    await ctx.reply("Inputs cleared. Let's start over.");
    await this.promptNextInput(ctx, chatId);
  }

  private async showSettingsMenu(ctx: Context, chatId: string) {
    const current = this.userSettings.get(chatId) || {
      imageModel: IMAGE_MODELS[0],
      videoModel: VIDEO_MODELS[0],
    };

    const imageKeyboard = new InlineKeyboard();
    for (const model of IMAGE_MODELS) {
      const label = model === current.imageModel ? `[${model}]` : model;
      imageKeyboard.text(label, `cfg:img:${model}`).row();
    }

    await ctx.reply('*Image Model:*', {
      parse_mode: ParseMode.MARKDOWN,
      reply_markup: imageKeyboard,
    });

    const videoKeyboard = new InlineKeyboard();
    for (const model of VIDEO_MODELS) {
      const label = model === current.videoModel ? `[${model}]` : model;
      videoKeyboard.text(label, `cfg:vid:${model}`).row();
    }

    await ctx.reply('*Video Model:*', {
      parse_mode: ParseMode.MARKDOWN,
      reply_markup: videoKeyboard,
    });
  }

  private getInternalApiHeaders(): { Authorization: string } | undefined {
    const apiKey = this.configService.API_KEY;
    return apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;
  }

  private async createWorkflowExecution(
    orgId: string,
    workflowId: string,
    inputValues: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    const response = await firstValueFrom(
      this.httpService.post(
        `${this.configService.API_URL}/v1/internal/orgs/${orgId}/workflow-executions`,
        {
          inputValues,
          metadata,
          workflow: workflowId,
        },
        {
          headers: this.getInternalApiHeaders(),
        },
      ),
    );
    const execution = extractWorkflowExecutionSnapshot(response.data);

    if (!execution.executionId) {
      throw new Error('Workflow execution did not return an execution id');
    }

    return execution.executionId;
  }

  private async getWorkflowExecution(orgId: string, executionId: string) {
    const response = await firstValueFrom(
      this.httpService.get(
        `${this.configService.API_URL}/v1/internal/orgs/${orgId}/workflow-executions/${executionId}`,
        {
          headers: this.getInternalApiHeaders(),
        },
      ),
    );

    return extractWorkflowExecutionSnapshot(response.data);
  }

  private async cancelWorkflowExecution(
    orgId: string,
    executionId: string,
  ): Promise<void> {
    await firstValueFrom(
      this.httpService.post(
        `${this.configService.API_URL}/v1/internal/orgs/${orgId}/workflow-executions/${executionId}/cancel`,
        {},
        {
          headers: this.getInternalApiHeaders(),
        },
      ),
    );
  }

  private async waitForWorkflowExecution(orgId: string, executionId: string) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < this.workflowExecutionPollTimeoutMs) {
      const execution = await this.getWorkflowExecution(orgId, executionId);

      if (isWorkflowExecutionTerminalStatus(execution.status)) {
        return execution;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, this.workflowExecutionPollIntervalMs),
      );
    }

    throw new Error('Workflow execution polling timed out');
  }

  private async monitorWorkflowExecution(
    orgId: string,
    chatId: string,
    ctx: Context,
  ): Promise<void> {
    const session = this.getSession(chatId);
    if (!session?.executionId) {
      return;
    }

    try {
      const execution = await this.waitForWorkflowExecution(
        orgId,
        session.executionId,
      );

      if (execution.status === 'cancelled') {
        this.deleteSession(chatId);
        return;
      }

      if (execution.status === 'failed') {
        await ctx.reply(
          execution.error ||
            'Workflow execution failed. Please try again.\nUse /workflows to start a new run.',
        );
        this.deleteSession(chatId);
        return;
      }

      const outputs = extractWorkflowOutputsFromExecution(execution);

      if (outputs.length > 0) {
        for (const output of outputs) {
          if (output.type === 'image' && output.url) {
            await ctx.replyWithPhoto(output.url, {
              caption: output.caption || 'Generated image',
            });
          } else if (output.type === 'video' && output.url) {
            await ctx.replyWithVideo(output.url, {
              caption: output.caption || 'Generated video',
            });
          } else if (output.text) {
            await ctx.reply(output.text);
          } else if (output.url) {
            await ctx.reply(output.url);
          }
        }
      } else {
        await ctx.reply('Workflow completed successfully.');
      }

      this.deleteSession(chatId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Workflow execution polling timed out'
      ) {
        await ctx.reply(
          'Workflow is still running. Use /status to check progress.',
        );
        return;
      }

      this.logger.error('Failed while monitoring workflow execution:', error);
      await ctx.reply(
        'Workflow execution failed. Please try again.\nUse /workflows to start a new run.',
      );
      this.deleteSession(chatId);
    }
  }
}
