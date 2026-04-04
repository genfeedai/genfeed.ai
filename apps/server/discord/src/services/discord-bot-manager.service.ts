import {
  BaseBotManager,
  DiscordSendToChannelEvent,
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
import { ConfigService } from '@discord/config/config.service';
import { RedisService } from '@libs/redis/redis.service';
import { HttpService } from '@nestjs/axios';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ActionRowBuilder,
  BaseGuildTextChannel,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';
import { firstValueFrom } from 'rxjs';

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

@Injectable()
export class DiscordBotManager
  extends BaseBotManager<DiscordBotInstance>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly platform = 'discord' as const;
  private readonly workflowExecutionPollIntervalMs = 2000;
  private readonly workflowExecutionPollTimeoutMs = 300000;
  private readonly integrationEvents = [
    REDIS_EVENTS.INTEGRATION_CREATED,
    REDIS_EVENTS.INTEGRATION_UPDATED,
    REDIS_EVENTS.INTEGRATION_DELETED,
  ] as const;
  private redisSubscribed = false;
  private channelEventSubscribed = false;
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
    this.logger.log('Initializing Discord Bot Manager');

    try {
      await this.subscribeToIntegrationEvents();
      await this.subscribeToChannelEvents();
      const integrations = await this.fetchActiveIntegrations();

      for (const integration of integrations) {
        await this.addIntegration(integration);
      }

      this.logger.log(
        `Discord Bot Manager initialized with ${this.getActiveCount()} bots`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize Discord Bot Manager:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.logger.log('Shutting down Discord Bot Manager');

    await this.unsubscribeFromIntegrationEvents();

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
    const allowedUserIds: string[] = integration.config.allowedUserIds || [];

    client.once(Events.ClientReady, async (readyClient) => {
      this.logger.log(
        `Discord bot ${integration.id} ready as ${readyClient.user.tag}`,
      );
      await this.registerSlashCommands(
        readyClient.user.id,
        integration.botToken,
      );
    });

    client.on('interactionCreate', async (interaction) => {
      // Auth check
      if (
        allowedUserIds.length > 0 &&
        !allowedUserIds.includes(interaction.user.id)
      ) {
        if (interaction.isRepliable()) {
          await interaction.reply({
            content: 'You are not authorized to use this bot.',
            ephemeral: true,
          });
        }
        return;
      }

      if (interaction.isChatInputCommand()) {
        switch (interaction.commandName) {
          case 'workflows':
            await this.handleWorkflowsCommand(interaction, orgId);
            break;
          case 'status':
            await this.handleStatusCommand(interaction);
            break;
          case 'cancel':
            await this.handleCancelCommand(interaction);
            break;
          case 'settings':
            await this.handleSettingsCommand(interaction);
            break;
        }
      } else if (interaction.isButton()) {
        await this.handleButtonInteraction(interaction, orgId);
      }
    });

    client.on('messageCreate', async (message) => {
      if (message.author.bot) {
        return;
      }

      // Auth check
      if (
        allowedUserIds.length > 0 &&
        !allowedUserIds.includes(message.author.id)
      ) {
        return;
      }

      const sessionKey = `${message.channelId}:${message.author.id}`;
      const session = this.getSession(sessionKey);
      if (!session || session.state !== 'collecting') {
        return;
      }

      if (message.attachments.size > 0) {
        await this.handleAttachmentInput(message, sessionKey);
      } else if (message.content) {
        await this.handleTextInput(message, sessionKey);
      }
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
      this.logger.error(`Error stopping bot ${botInstance.id}`, error);
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
      this.logger.error('Failed to register slash commands:', error);
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
      editReply: (msg: any) => Promise<unknown>;
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
      this.logger.error('Failed to fetch workflows:', error);
      await interaction.editReply(
        'Failed to load workflows. Please try again.',
      );
    }
  }

  private async handleStatusCommand(interaction: {
    channelId: string | null;
    user: { id: string };
    reply: (msg: any) => Promise<unknown>;
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
              const execution = await this.getWorkflowExecution(
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
    reply: (msg: any) => Promise<unknown>;
  }): Promise<void> {
    const sessionKey = this.getSessionKey(interaction);
    const session = this.getSession(sessionKey);
    if (!session || session.state === 'idle') {
      await interaction.reply('Nothing to cancel.');
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

    this.deleteSession(sessionKey);
    await interaction.reply('Cancelled. Use /workflows to start again.');
  }

  private async handleSettingsCommand(interaction: {
    channelId: string | null;
    user: { id: string };
    reply: (msg: any) => Promise<unknown>;
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
      editReply: (msg: any) => Promise<unknown>;
      reply: (msg: any) => Promise<unknown>;
      update: (msg: any) => Promise<unknown>;
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
      editReply: (msg: any) => Promise<unknown>;
      update: (msg: any) => Promise<unknown>;
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
      this.logger.error('Failed to select workflow:', error);
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
    channel: { editReply?: (msg: any) => Promise<unknown> },
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
    message: {
      author: { id: string };
      channelId: string;
      content: string;
      channel: { send: (msg: any) => Promise<unknown> };
    },
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
    message: {
      author: { id: string };
      channelId: string;
      attachments: Map<string, { url: string; contentType?: string | null }>;
      channel: { send: (msg: any) => Promise<unknown> };
    },
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
    channel: { send: (msg: any) => Promise<unknown> },
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
    channel: { editReply?: (msg: any) => Promise<unknown> },
  ): Promise<void> {
    const session = this.getSession(sessionKey);
    if (!session) {
      return;
    }

    session.state = 'confirming';
    this.setSession(sessionKey, session);

    const { content, row } = this.buildConfirmationMessage(session);

    if (channel.editReply) {
      await channel.editReply({ components: [row], content });
    }
  }

  private async showConfirmationViaChannel(
    sessionKey: string,
    channel: { send: (msg: any) => Promise<unknown> },
  ): Promise<void> {
    const session = this.getSession(sessionKey);
    if (!session) {
      return;
    }

    session.state = 'confirming';
    this.setSession(sessionKey, session);

    const { content, row } = this.buildConfirmationMessage(session);
    await channel.send({ components: [row], content });
  }

  private buildConfirmationMessage(session: WorkflowSession): {
    content: string;
    row: ActionRowBuilder<ButtonBuilder>;
  } {
    const lines = [`**Workflow:** ${session.workflowName}\n`];
    for (const input of session.requiredInputs) {
      const value = session.collectedInputs.get(input.nodeId) || '(empty)';
      const displayValue =
        input.inputType === 'image' ? '[Image uploaded]' : value;
      lines.push(`**${input.label}:** ${displayValue}`);
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm:run')
        .setLabel('Run')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('confirm:edit')
        .setLabel('Edit')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('confirm:cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger),
    );

    return {
      content: `**Review your inputs:**\n\n${lines.join('\n')}`,
      row,
    };
  }

  // --- Workflow execution ---

  private async handleRun(
    interaction: {
      channelId: string | null;
      user: { id: string };
      deferUpdate: () => Promise<unknown>;
      editReply: (msg: any) => Promise<unknown>;
      update: (msg: any) => Promise<unknown>;
      channel?: { send?: (msg: any) => Promise<unknown> } | null;
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
      const executionId = await this.createWorkflowExecution(
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
      this.logger.error('Failed to execute workflow:', error);
      const send = interaction.channel?.send;
      if (send) {
        await send(
          'Workflow execution failed. Please try again.\nUse /workflows to start a new run.',
        );
      }
      this.deleteSession(sessionKey);
    }
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
    sessionKey: string,
    send: (msg: any) => Promise<unknown>,
  ): Promise<void> {
    const session = this.getSession(sessionKey);
    if (!session?.executionId) {
      return;
    }

    try {
      const execution = await this.waitForWorkflowExecution(
        orgId,
        session.executionId,
      );

      if (execution.status === 'cancelled') {
        this.deleteSession(sessionKey);
        return;
      }

      if (execution.status === 'failed') {
        await send(
          execution.error ||
            'Workflow execution failed. Please try again.\nUse /workflows to start a new run.',
        );
        this.deleteSession(sessionKey);
        return;
      }

      const outputs = extractWorkflowOutputsFromExecution(execution);

      if (outputs.length > 0) {
        for (const output of outputs) {
          if (output.url) {
            await send(
              `${output.caption || `Generated ${output.type}`}\n${output.url}`,
            );
          } else if (output.text) {
            await send(output.text);
          }
        }
      } else {
        await send('Workflow completed successfully.');
      }

      this.deleteSession(sessionKey);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Workflow execution polling timed out'
      ) {
        await send('Workflow is still running. Use /status to check progress.');
        return;
      }

      this.logger.error('Failed while monitoring workflow execution:', error);
      await send(
        'Workflow execution failed. Please try again.\nUse /workflows to start a new run.',
      );
      this.deleteSession(sessionKey);
    }
  }

  private async handleEdit(interaction: {
    channelId: string | null;
    user: { id: string };
    deferUpdate: () => Promise<unknown>;
    editReply: (msg: any) => Promise<unknown>;
    update: (msg: any) => Promise<unknown>;
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
    const botInstance = this.bots.get(orgId);

    if (!botInstance) {
      this.logger.warn(
        `[DiscordBotManager] No active bot found for orgId: ${orgId}`,
      );
      return null;
    }

    try {
      const channel = await botInstance.client.channels.fetch(channelId);

      if (!channel || !(channel instanceof BaseGuildTextChannel)) {
        this.logger.warn(
          `[DiscordBotManager] Channel ${channelId} not found or not a text channel for orgId: ${orgId}`,
        );
        return null;
      }

      const sent = await channel.send({ content: message });

      // Build a canonical message URL: https://discord.com/channels/{guildId}/{channelId}/{messageId}
      const guildId = channel.guildId;
      const messageUrl = `https://discord.com/channels/${guildId}/${channelId}/${sent.id}`;

      this.logger.log(
        `[DiscordBotManager] Message sent to channel ${channelId} for orgId: ${orgId}`,
      );

      return messageUrl;
    } catch (error) {
      this.logger.error(
        `[DiscordBotManager] Failed to send message to channel ${channelId} for orgId: ${orgId}`,
        error,
      );
      return null;
    }
  }

  private isDiscordSendToChannelEvent(
    data: unknown,
  ): data is DiscordSendToChannelEvent {
    return (
      typeof data === 'object' &&
      data !== null &&
      'orgId' in data &&
      'channelId' in data &&
      'message' in data &&
      typeof (data as DiscordSendToChannelEvent).orgId === 'string' &&
      typeof (data as DiscordSendToChannelEvent).channelId === 'string' &&
      typeof (data as DiscordSendToChannelEvent).message === 'string'
    );
  }

  private async subscribeToChannelEvents(): Promise<void> {
    if (this.channelEventSubscribed) {
      return;
    }

    await this.redisService.subscribe(
      REDIS_EVENTS.DISCORD_SEND_TO_CHANNEL,
      (data: unknown) => {
        if (!this.isDiscordSendToChannelEvent(data)) {
          return;
        }
        this.sendToChannel(data.orgId, data.channelId, data.message).catch(
          (err) =>
            this.logger.error(
              'Failed to handle discord:send-to-channel event',
              err,
            ),
        );
      },
    );

    this.channelEventSubscribed = true;
    this.logger.log('Subscribed to Discord send-to-channel Redis event');
  }

  // --- Integration event handling ---

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
    this.logger.log('Subscribed to Discord integration Redis events');
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
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.configService.API_URL}/v1/internal/integrations/discord`,
          {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
          },
        ),
      );
      return this.normalizeIntegrations(response.data);
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
        this.logger.error('Failed to fetch integrations:', error);
      }
      return [];
    }
  }

  protected async fetchAndAddIntegration(integrationId: string): Promise<void> {
    try {
      const apiKey = this.configService.API_KEY;
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.configService.API_URL}/v1/internal/integrations/discord/${integrationId}`,
          {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
          },
        ),
      );
      const integration = this.normalizeIntegration(response.data);
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
          `${this.configService.API_URL}/v1/internal/integrations/discord/${integrationId}`,
          {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
          },
        ),
      );
      const integration = this.normalizeIntegration(response.data);
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
}
