import { ConfigService } from '@discord/config/config.service';
import { formatAgentFailureMessage } from '@genfeedai/agent/server';
import { IntegrationPlatform } from '@genfeedai/contracts';
import {
  BaseBotManager,
  type BotHttpAdapter,
  BotInternalApiClient,
  IMAGE_MODELS,
  isBotOpenToAllUsers,
  OrgIntegration,
  UserSettings,
  VIDEO_MODELS,
  WorkflowInput,
  WorkflowSession,
} from '@genfeedai/integrations';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { HttpService } from '@nestjs/axios';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  GatewayIntentBits,
  type Message,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';
import { firstValueFrom } from 'rxjs';
import { registerDiscordBotHandlers } from './discord-bot-handlers';
import { DiscordBotSubscriptions } from './discord-bot-subscriptions';
import { sendDiscordChannelMessage } from './discord-channel-sender';
import { buildDiscordConfirmationMessage } from './discord-confirmation';
import { DiscordWorkflowExecutionClient } from './discord-workflow-execution.client';
import { monitorDiscordWorkflowExecution } from './discord-workflow-monitor';

interface DiscordBotInstance {
  id: string;
  orgId: string;
  client: Client;
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

type DiscordMessagePayload =
  | string
  | {
      components?: Array<ActionRowBuilder<ButtonBuilder>>;
      content?: string;
      ephemeral?: boolean;
    };

function makeBotHttpAdapter(httpService: HttpService): BotHttpAdapter {
  return {
    async get<T>(url: string, headers?: Record<string, string>): Promise<T> {
      const response = await firstValueFrom(
        httpService.get<T>(url, headers ? { headers } : undefined),
      );
      return response.data;
    },
    async post<T>(
      url: string,
      body: unknown,
      headers?: Record<string, string>,
    ): Promise<T> {
      const response = await firstValueFrom(
        httpService.post<T>(url, body, headers ? { headers } : undefined),
      );
      return response.data;
    },
  };
}

@Injectable()
export class DiscordBotManager
  extends BaseBotManager<DiscordBotInstance>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly platform = IntegrationPlatform.DISCORD;
  private readonly workflowExecutionPollIntervalMs = 2000;
  private readonly workflowExecutionPollTimeoutMs = 300000;
  private readonly sessions = new Map<string, WorkflowSession>();
  private readonly userSettings = new Map<string, UserSettings>();
  private readonly internalApiClient: BotInternalApiClient;
  private readonly subscriptions: DiscordBotSubscriptions;
  private readonly workflowExecutionClient: DiscordWorkflowExecutionClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly redisService: RedisService,
    logger: LoggerService,
  ) {
    super(logger);
    this.internalApiClient = new BotInternalApiClient({
      apiKey: this.configService.API_KEY,
      apiUrl: this.configService.API_URL,
      http: makeBotHttpAdapter(this.httpService),
      platform: this.platform,
    });
    this.subscriptions = new DiscordBotSubscriptions(
      this.redisService,
      this.logger,
      {
        handleIntegrationEvent: (event, data) =>
          this.handleRedisEvent(event, data),
        sendToChannel: (orgId, channelId, message) =>
          this.sendToChannel(orgId, channelId, message),
      },
    );
    this.workflowExecutionClient = new DiscordWorkflowExecutionClient({
      apiKey: this.configService.API_KEY,
      apiUrl: this.configService.API_URL,
      httpService: this.httpService,
      pollIntervalMs: this.workflowExecutionPollIntervalMs,
      pollTimeoutMs: this.workflowExecutionPollTimeoutMs,
    });
  }

  async onModuleInit() {
    await this.initialize();
  }

  async onModuleDestroy() {
    await this.shutdown();
  }

  async initialize(): Promise<void> {
    this.logger.log('Initializing Discord Bot Manager');

    try {
      await this.subscriptions.subscribe();
      const integrations = await this.fetchActiveIntegrations();

      for (const integration of integrations) {
        await this.addIntegration(integration);
      }

      this.logger.log(
        `Discord Bot Manager initialized with ${this.getActiveCount()} bots`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to initialize Discord Bot Manager:',
        this.sanitizeErrorForLog(error),
      );
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.logger.log('Shutting down Discord Bot Manager');

    await this.subscriptions.unsubscribe();

    for (const [, botInstance] of this.bots.entries()) {
      await this.destroyBotInstance(botInstance);
    }

    this.bots.clear();
    this.sessions.clear();
    this.userSettings.clear();
  }

  async createBotInstance(
    integration: OrgIntegration,
  ): Promise<DiscordBotInstance> {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    const orgId = integration.orgId;
    const accessConfig = integration.config;

    if (isBotOpenToAllUsers(accessConfig)) {
      this.logger.warn(
        `Discord integration ${integration.id} (org ${orgId}) is configured open to all users — every Discord user who can reach this bot can spend its org's credits`,
      );
    }

    registerDiscordBotHandlers(client, integration, {
      getSession: (sessionKey) => this.getSession(sessionKey),
      handleAttachmentInput: (message, sessionKey) =>
        this.handleAttachmentInput(message, sessionKey),
      handleButtonInteraction: (interaction, targetOrgId) =>
        this.handleButtonInteraction(interaction, targetOrgId),
      handleCancelCommand: (interaction) =>
        this.handleCancelCommand(interaction),
      handleSettingsCommand: (interaction) =>
        this.handleSettingsCommand(interaction),
      handleStatusCommand: (interaction) =>
        this.handleStatusCommand(interaction),
      handleTextInput: (message, sessionKey) =>
        this.handleTextInput(message, sessionKey),
      handleWorkflowsCommand: (interaction, targetOrgId) =>
        this.handleWorkflowsCommand(interaction, targetOrgId),
      logReady: (tag) =>
        this.logger.log(`Discord bot ${integration.id} ready as ${tag}`),
      registerSlashCommands: (clientId, botToken) =>
        this.registerSlashCommands(clientId, botToken),
    });

    await client.login(integration.botToken);

    return {
      client,
      id: integration.id,
      integration,
      orgId: integration.orgId,
    };
  }

  async destroyBotInstance(botInstance: DiscordBotInstance): Promise<void> {
    try {
      await botInstance.client.destroy();
    } catch (error) {
      this.logger.error(
        `Error stopping bot ${botInstance.id}`,
        this.sanitizeErrorForLog(error),
      );
    }
  }

  // --- Slash command registration ---

  private async registerSlashCommands(
    clientId: string,
    botToken: string,
  ): Promise<void> {
    const commands = [
      new SlashCommandBuilder()
        .setName('workflows')
        .setDescription('Browse & run AI workflows'),
      new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check current workflow status'),
      new SlashCommandBuilder()
        .setName('cancel')
        .setDescription('Cancel current workflow'),
      new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Configure model preferences'),
    ];

    try {
      const rest = new REST().setToken(botToken);
      await rest.put(Routes.applicationCommands(clientId), {
        body: commands.map((cmd) => cmd.toJSON()),
      });
      this.logger.log(`Registered slash commands for bot ${clientId}`);
    } catch (error) {
      this.logger.error(
        'Failed to register slash commands:',
        this.sanitizeErrorForLog(error),
      );
    }
  }

  // --- Session helpers ---

  private getSessionKey(interaction: {
    channelId: string | null;
    user: { id: string };
  }): string {
    return `${interaction.channelId}:${interaction.user.id}`;
  }

  private getSession(key: string): WorkflowSession | undefined {
    return this.sessions.get(key);
  }

  private setSession(key: string, session: WorkflowSession): void {
    this.sessions.set(key, session);
  }

  private deleteSession(key: string): void {
    this.sessions.delete(key);
  }

  // --- Command handlers ---

  private async handleWorkflowsCommand(
    interaction: {
      channelId: string | null;
      user: { id: string };
      deferReply: () => Promise<unknown>;
      editReply: (msg: DiscordMessagePayload) => Promise<unknown>;
    },
    orgId: string,
  ): Promise<void> {
    const sessionKey = this.getSessionKey(interaction);
    const existing = this.getSession(sessionKey);
    if (existing?.state === 'running') {
      await interaction.deferReply();
      await interaction.editReply(
        'A workflow is running. Use /status to check progress or /cancel to abort.',
      );
      return;
    }

    await interaction.deferReply();

    try {
      const workflows = await this.fetchOrgWorkflows(orgId);

      if (workflows.length === 0) {
        await interaction.editReply(
          'No workflows available for your organization.',
        );
        return;
      }

      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      let currentRow = new ActionRowBuilder<ButtonBuilder>();
      let buttonCount = 0;

      for (const wf of workflows) {
        if (buttonCount >= 5) {
          rows.push(currentRow);
          if (rows.length >= 5) {
            break;
          }
          currentRow = new ActionRowBuilder<ButtonBuilder>();
          buttonCount = 0;
        }

        currentRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`wf:${wf.id}`)
            .setLabel(wf.name.slice(0, 80))
            .setStyle(ButtonStyle.Primary),
        );
        buttonCount++;
      }

      if (buttonCount > 0 && rows.length < 5) {
        rows.push(currentRow);
      }

      this.setSession(sessionKey, {
        collectedInputs: new Map(),
        currentInputIndex: 0,
        orgId,
        requiredInputs: [],
        startedAt: Date.now(),
        state: 'selecting',
      });

      await interaction.editReply({
        components: rows,
        content: '**GenFeed AI Workflows**\nSelect a workflow to run:',
      });
    } catch (error) {
      this.logger.error(
        'Failed to fetch workflows:',
        this.sanitizeErrorForLog(error),
      );
      await interaction.editReply(
        'Failed to load workflows. Please try again.',
      );
    }
  }

  private async handleStatusCommand(interaction: {
    channelId: string | null;
    user: { id: string };
    reply: (msg: DiscordMessagePayload) => Promise<unknown>;
  }): Promise<void> {
    const sessionKey = this.getSessionKey(interaction);
    const session = this.getSession(sessionKey);

    let line = 'Idle — no active workflow';
    if (session) {
      switch (session.state) {
        case 'selecting':
          line = 'Selecting a workflow';
          break;
        case 'collecting':
          line = `Collecting inputs (${session.currentInputIndex}/${session.requiredInputs.length})`;
          break;
        case 'confirming':
          line = 'Waiting for confirmation';
          break;
        case 'running':
          line = `Running **${session.workflowName}**`;
          if (session.executionId && session.orgId) {
            try {
              const execution = await this.workflowExecutionClient.get(
                session.orgId,
                session.executionId,
              );
              if (execution.status) {
                line = `Running **${session.workflowName}** (${execution.status})`;
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

    await interaction.reply(`**GenFeed Bot Status**\n\nYour status: ${line}`);
  }

  private async handleCancelCommand(interaction: {
    channelId: string | null;
    user: { id: string };
    reply: (msg: DiscordMessagePayload) => Promise<unknown>;
  }): Promise<void> {
    const sessionKey = this.getSessionKey(interaction);
    const session = this.getSession(sessionKey);
    if (!session || session.state === 'idle') {
      await interaction.reply('Nothing to cancel.');
      return;
    }

    if (session.executionId && session.orgId) {
      try {
        await this.workflowExecutionClient.cancel(
          session.orgId,
          session.executionId,
        );
      } catch (error) {
        this.logger.warn('Failed to cancel workflow execution', {
          error,
          executionId: session.executionId,
        });
      }
    }

    this.deleteSession(sessionKey);
    await interaction.reply('Cancelled. Use /workflows to start again.');
  }

  private async handleSettingsCommand(interaction: {
    channelId: string | null;
    user: { id: string };
    reply: (msg: DiscordMessagePayload) => Promise<unknown>;
  }): Promise<void> {
    const current = this.userSettings.get(interaction.user.id) || {
      imageModel: IMAGE_MODELS[0],
      videoModel: VIDEO_MODELS[0],
    };

    const imageRow = new ActionRowBuilder<ButtonBuilder>();
    for (const model of IMAGE_MODELS) {
      imageRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`cfg:img:${model}`)
          .setLabel(model === current.imageModel ? `[${model}]` : model)
          .setStyle(
            model === current.imageModel
              ? ButtonStyle.Success
              : ButtonStyle.Secondary,
          ),
      );
    }

    const videoRow = new ActionRowBuilder<ButtonBuilder>();
    for (const model of VIDEO_MODELS) {
      videoRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`cfg:vid:${model}`)
          .setLabel(model === current.videoModel ? `[${model}]` : model)
          .setStyle(
            model === current.videoModel
              ? ButtonStyle.Success
              : ButtonStyle.Secondary,
          ),
      );
    }

    await interaction.reply({
      components: [imageRow, videoRow],
      content: '**Settings**\n\n**Image Model:**\n\n**Video Model:**',
    });
  }

  // --- Button interaction handler ---

  private async handleButtonInteraction(
    interaction: {
      customId: string;
      channelId: string | null;
      user: { id: string };
      deferUpdate: () => Promise<unknown>;
      editReply: (msg: DiscordMessagePayload) => Promise<unknown>;
      reply: (msg: DiscordMessagePayload) => Promise<unknown>;
      update: (msg: DiscordMessagePayload) => Promise<unknown>;
    },
    orgId: string,
  ): Promise<void> {
    const customId = interaction.customId;

    if (customId.startsWith('wf:')) {
      const workflowId = customId.slice(3);
      await this.selectWorkflow(interaction, orgId, workflowId);
    } else if (customId === 'confirm:run') {
      await this.handleRun(interaction, orgId);
    } else if (customId === 'confirm:edit') {
      await this.handleEdit(interaction);
    } else if (customId === 'confirm:cancel') {
      const sessionKey = this.getSessionKey(interaction);
      this.deleteSession(sessionKey);
      await interaction.update({
        components: [],
        content: 'Cancelled. Use /workflows to start again.',
      });
    } else if (customId.startsWith('cfg:img:')) {
      const model = customId.slice(8);
      const settings = this.userSettings.get(interaction.user.id) || {
        imageModel: IMAGE_MODELS[0],
        videoModel: VIDEO_MODELS[0],
      };
      settings.imageModel = model;
      this.userSettings.set(interaction.user.id, settings);
      await interaction.reply({
        content: `Image model set to: **${model}**`,
        ephemeral: true,
      });
    } else if (customId.startsWith('cfg:vid:')) {
      const model = customId.slice(8);
      const settings = this.userSettings.get(interaction.user.id) || {
        imageModel: IMAGE_MODELS[0],
        videoModel: VIDEO_MODELS[0],
      };
      settings.videoModel = model;
      this.userSettings.set(interaction.user.id, settings);
      await interaction.reply({
        content: `Video model set to: **${model}**`,
        ephemeral: true,
      });
    }
  }

  // --- Workflow selection & input collection ---

  private async selectWorkflow(
    interaction: {
      channelId: string | null;
      user: { id: string };
      deferUpdate: () => Promise<unknown>;
      editReply: (msg: DiscordMessagePayload) => Promise<unknown>;
      update: (msg: DiscordMessagePayload) => Promise<unknown>;
    },
    orgId: string,
    workflowId: string,
  ): Promise<void> {
    await interaction.deferUpdate();

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.configService.API_URL}/v1/orgs/${orgId}/workflows/${workflowId}`,
        ),
      );

      const workflow: WorkflowDefinition = response.data;
      const requiredInputs = this.extractWorkflowInputs(workflow);
      const sessionKey = this.getSessionKey(interaction);

      this.setSession(sessionKey, {
        collectedInputs: new Map(),
        currentInputIndex: 0,
        orgId,
        requiredInputs,
        startedAt: Date.now(),
        state: 'collecting',
        workflowId,
        workflowName: workflow.name,
      });

      await interaction.editReply({
        components: [],
        content: `**${workflow.name}**\n${workflow.description || ''}\nThis workflow requires **${requiredInputs.length}** input(s).`,
      });

      await this.promptNextInput(sessionKey, interaction);
    } catch (error) {
      this.logger.error(
        'Failed to select workflow:',
        this.sanitizeErrorForLog(error),
      );
      await interaction.editReply({
        components: [],
        content: 'Failed to load workflow details. Please try again.',
      });
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

  private async promptNextInput(
    sessionKey: string,
    channel: { editReply?: (msg: DiscordMessagePayload) => Promise<unknown> },
  ): Promise<void> {
    const session = this.getSession(sessionKey);
    if (!session) {
      return;
    }

    if (session.currentInputIndex >= session.requiredInputs.length) {
      await this.showConfirmation(sessionKey, channel);
      return;
    }

    const input = session.requiredInputs[session.currentInputIndex];
    const position = `(${session.currentInputIndex + 1}/${session.requiredInputs.length})`;

    let content: string;
    if (input.inputType === 'image') {
      content = `**Input ${position}:** ${input.label}\n\nPlease upload an image.`;
    } else {
      const defaultHint = input.defaultValue
        ? `\nDefault: \`${input.defaultValue}\` (type "default" to use it)`
        : '';
      content = `**Input ${position}:** ${input.label}\n\nPlease type your value.${defaultHint}`;
    }

    if (channel.editReply) {
      await channel.editReply({ components: [], content });
    }
  }

  private async handleTextInput(
    message: Message,
    sessionKey: string,
  ): Promise<void> {
    const session = this.getSession(sessionKey);
    if (!session || session.state !== 'collecting') {
      return;
    }

    const currentInput = session.requiredInputs[session.currentInputIndex];
    if (!currentInput || currentInput.inputType !== 'text') {
      return;
    }
    if (!message.channel.isSendable()) {
      return;
    }

    let value = message.content;
    if (value.toLowerCase() === 'default' && currentInput.defaultValue) {
      value = currentInput.defaultValue;
    }

    session.collectedInputs.set(currentInput.nodeId, value);
    session.currentInputIndex++;
    this.setSession(sessionKey, session);

    await this.promptNextInputViaChannel(sessionKey, message.channel);
  }

  private async handleAttachmentInput(
    message: Message,
    sessionKey: string,
  ): Promise<void> {
    const session = this.getSession(sessionKey);
    if (!session || session.state !== 'collecting') {
      return;
    }

    const currentInput = session.requiredInputs[session.currentInputIndex];
    if (!currentInput || currentInput.inputType !== 'image') {
      return;
    }
    if (!message.channel.isSendable()) {
      return;
    }

    const attachment = message.attachments.values().next().value;
    if (!attachment) {
      return;
    }

    session.collectedInputs.set(currentInput.nodeId, attachment.url);
    session.currentInputIndex++;
    this.setSession(sessionKey, session);

    await message.channel.send('Image received.');
    await this.promptNextInputViaChannel(sessionKey, message.channel);
  }

  private async promptNextInputViaChannel(
    sessionKey: string,
    channel: { send: (msg: DiscordMessagePayload) => Promise<unknown> },
  ): Promise<void> {
    const session = this.getSession(sessionKey);
    if (!session) {
      return;
    }

    if (session.currentInputIndex >= session.requiredInputs.length) {
      await this.showConfirmationViaChannel(sessionKey, channel);
      return;
    }

    const input = session.requiredInputs[session.currentInputIndex];
    const position = `(${session.currentInputIndex + 1}/${session.requiredInputs.length})`;

    if (input.inputType === 'image') {
      await channel.send(
        `**Input ${position}:** ${input.label}\n\nPlease upload an image.`,
      );
    } else {
      const defaultHint = input.defaultValue
        ? `\nDefault: \`${input.defaultValue}\` (type "default" to use it)`
        : '';
      await channel.send(
        `**Input ${position}:** ${input.label}\n\nPlease type your value.${defaultHint}`,
      );
    }
  }

  // --- Confirmation ---

  private async showConfirmation(
    sessionKey: string,
    channel: { editReply?: (msg: DiscordMessagePayload) => Promise<unknown> },
  ): Promise<void> {
    const session = this.getSession(sessionKey);
    if (!session) {
      return;
    }

    session.state = 'confirming';
    this.setSession(sessionKey, session);

    const { content, row } = buildDiscordConfirmationMessage(session);

    if (channel.editReply) {
      await channel.editReply({ components: [row], content });
    }
  }

  private async showConfirmationViaChannel(
    sessionKey: string,
    channel: { send: (msg: DiscordMessagePayload) => Promise<unknown> },
  ): Promise<void> {
    const session = this.getSession(sessionKey);
    if (!session) {
      return;
    }

    session.state = 'confirming';
    this.setSession(sessionKey, session);

    const { content, row } = buildDiscordConfirmationMessage(session);
    await channel.send({ components: [row], content });
  }

  // --- Workflow execution ---

  private async handleRun(
    interaction: {
      channelId: string | null;
      user: { id: string };
      deferUpdate: () => Promise<unknown>;
      editReply: (msg: DiscordMessagePayload) => Promise<unknown>;
      update: (msg: DiscordMessagePayload) => Promise<unknown>;
      channel?: {
        send?: (msg: DiscordMessagePayload) => Promise<unknown>;
      } | null;
    },
    orgId: string,
  ): Promise<void> {
    const sessionKey = this.getSessionKey(interaction);
    const session = this.getSession(sessionKey);
    if (!session || !session.workflowId) {
      await interaction.update({
        components: [],
        content: 'No workflow selected. Use /workflows to start.',
      });
      return;
    }

    session.state = 'running';
    this.setSession(sessionKey, session);

    await interaction.update({
      components: [],
      content: `Running **${session.workflowName}**...\nUse /status to check progress.`,
    });

    try {
      const inputPayload: Record<string, string> = {};
      for (const [key, value] of session.collectedInputs.entries()) {
        inputPayload[key] = value;
      }

      const settings = this.userSettings.get(interaction.user.id);
      const metadata = settings
        ? {
            imageModel: settings.imageModel,
            videoModel: settings.videoModel,
          }
        : undefined;
      const executionId = await this.workflowExecutionClient.create(
        orgId,
        session.workflowId,
        inputPayload,
        metadata,
      );
      session.executionId = executionId;
      this.setSession(sessionKey, session);

      const send = interaction.channel?.send;
      if (send) {
        void this.monitorWorkflowExecution(orgId, sessionKey, send);
      }
    } catch (error) {
      this.logger.error(
        'Failed to execute workflow:',
        this.sanitizeErrorForLog(error),
      );
      const send = interaction.channel?.send;
      const message = error instanceof Error ? error.message : undefined;
      await send?.(formatAgentFailureMessage(message));
      this.deleteSession(sessionKey);
    }
  }

  private async monitorWorkflowExecution(
    orgId: string,
    sessionKey: string,
    send: (msg: DiscordMessagePayload) => Promise<unknown>,
  ): Promise<void> {
    const session = this.getSession(sessionKey);
    if (!session?.executionId) {
      return;
    }

    await monitorDiscordWorkflowExecution({
      deleteSession: () => this.deleteSession(sessionKey),
      executionClient: this.workflowExecutionClient,
      executionId: session.executionId,
      logger: this.logger,
      orgId,
      send,
    });
  }

  private async handleEdit(interaction: {
    channelId: string | null;
    user: { id: string };
    deferUpdate: () => Promise<unknown>;
    editReply: (msg: DiscordMessagePayload) => Promise<unknown>;
    update: (msg: DiscordMessagePayload) => Promise<unknown>;
  }): Promise<void> {
    const sessionKey = this.getSessionKey(interaction);
    const session = this.getSession(sessionKey);
    if (!session) {
      return;
    }

    session.currentInputIndex = 0;
    session.collectedInputs = new Map();
    session.state = 'collecting';
    this.setSession(sessionKey, session);

    await interaction.update({
      components: [],
      content: "Inputs cleared. Let's start over.",
    });

    await this.promptNextInput(sessionKey, interaction);
  }

  // --- Announcement channel messaging ---

  /**
   * Send a message to a Discord channel for a given org bot.
   * Returns the message URL if available, null on failure.
   */
  async sendToChannel(
    orgId: string,
    channelId: string,
    message: string,
  ): Promise<string | null> {
    return sendDiscordChannelMessage(
      this.bots.get(orgId)?.client,
      orgId,
      channelId,
      message,
      this.logger,
    );
  }

  // --- API fetch methods ---

  private async fetchActiveIntegrations(): Promise<OrgIntegration[]> {
    try {
      return await this.internalApiClient.fetchActiveIntegrations();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = (error as { response?: { status?: number } })?.response
        ?.status;

      if (message.includes('ECONNREFUSED')) {
        this.logger.warn(
          `API unavailable at ${this.configService.API_URL} — starting with 0 bots. Start the API service first.`,
        );
      } else if (status === 401) {
        this.logger.warn(
          'API returned 401 — set GENFEEDAI_API_KEY in your .env to authenticate with the API.',
        );
      } else {
        this.logger.error(
          'Failed to fetch integrations:',
          this.sanitizeErrorForLog(error),
        );
      }
      return [];
    }
  }

  protected async fetchAndAddIntegration(integrationId: string): Promise<void> {
    try {
      const integration =
        await this.internalApiClient.fetchIntegration(integrationId);
      if (!integration) {
        this.logger.warn(
          `Unable to normalize Discord integration payload: ${integrationId}`,
        );
        return;
      }
      await this.addIntegration(integration);
    } catch (error) {
      this.logger.error(
        `Failed to fetch and add integration ${integrationId}:`,
        this.sanitizeErrorForLog(error),
      );
    }
  }

  protected async fetchAndUpdateIntegration(
    integrationId: string,
  ): Promise<void> {
    try {
      const integration =
        await this.internalApiClient.fetchIntegration(integrationId);
      if (!integration) {
        this.logger.warn(
          `Unable to normalize Discord integration payload: ${integrationId}`,
        );
        return;
      }
      await this.updateIntegration(integration);
    } catch (error) {
      this.logger.error(
        `Failed to fetch and update integration ${integrationId}:`,
        this.sanitizeErrorForLog(error),
      );
    }
  }

  private async fetchOrgWorkflows(
    orgId: string,
  ): Promise<WorkflowDefinition[]> {
    try {
      return await this.internalApiClient.fetchOrgWorkflows(orgId);
    } catch (error) {
      this.logger.error(
        'Failed to fetch workflows:',
        this.sanitizeErrorForLog(error),
      );
      return [];
    }
  }
}
