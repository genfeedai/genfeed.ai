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
import { App } from '@slack/bolt';
import { ConfigService } from '@slack/config/config.service';
import { firstValueFrom } from 'rxjs';

interface SlackBotInstance {
  id: string;
  orgId: string;
  app: App;
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
export class SlackBotManager
  extends BaseBotManager<SlackBotInstance>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly platform = 'slack' as const;
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
    this.logger.log('Initializing Slack Bot Manager');

    try {
      await this.subscribeToIntegrationEvents();
      const integrations = await this.fetchActiveIntegrations();

      for (const integration of integrations) {
        await this.addIntegration(integration);
      }

      this.logger.log(
        `Slack Bot Manager initialized with ${this.getActiveCount()} bots`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize Slack Bot Manager:', error);
    }
  }

  async shutdown(): Promise<void> {
    this.logger.log('Shutting down Slack Bot Manager');

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
  ): Promise<SlackBotInstance> {
    const app = new App({
      appToken: integration.config.appToken,
      socketMode: true,
      token: integration.botToken,
    });

    const orgId = integration.orgId;
    const allowedUserIds: string[] = integration.config.allowedUserIds || [];

    // Auth middleware
    app.use(async ({ next, context }) => {
      const userId = context.userId as string | undefined;
      if (
        allowedUserIds.length > 0 &&
        (!userId || !allowedUserIds.includes(userId))
      ) {
        return;
      }
      await next();
    });

    // Slash commands
    app.command('/workflows', async ({ command, ack, respond }) => {
      await ack();
      await this.handleWorkflowsCommand(command.user_id, orgId, respond);
    });

    app.command('/status', async ({ command, ack, respond }) => {
      await ack();
      await this.handleStatusCommand(command.user_id, respond);
    });

    app.command('/cancel', async ({ command, ack, respond }) => {
      await ack();
      await this.handleCancelCommand(command.user_id, respond);
    });

    app.command('/settings', async ({ command, ack, respond }) => {
      await ack();
      await this.handleSettingsCommand(command.user_id, respond);
    });

    // Action handlers for Block Kit buttons
    app.action(/^wf:/, async ({ action, ack, respond, body }) => {
      await ack();
      const actionValue = (action as { value?: string }).value || '';
      const workflowId = actionValue.slice(3);
      const userId = body.user.id;
      await this.selectWorkflow(userId, orgId, workflowId, respond);
    });

    app.action('confirm:run', async ({ ack, respond, body }) => {
      await ack();
      await this.handleRun(body.user.id, orgId, respond);
    });

    app.action('confirm:edit', async ({ ack, respond, body }) => {
      await ack();
      await this.handleEdit(body.user.id, respond);
    });

    app.action('confirm:cancel', async ({ ack, respond, body }) => {
      await ack();
      this.deleteSession(body.user.id);
      await respond({
        replace_original: true,
        text: 'Cancelled. Use /workflows to start again.',
      });
    });

    app.action(/^cfg:img:/, async ({ action, ack, respond, body }) => {
      await ack();
      const model = ((action as { value?: string }).value || '').slice(8);
      const settings = this.userSettings.get(body.user.id) || {
        imageModel: IMAGE_MODELS[0],
        videoModel: VIDEO_MODELS[0],
      };
      settings.imageModel = model;
      this.userSettings.set(body.user.id, settings);
      await respond({ text: `Image model set to: *${model}*` });
    });

    app.action(/^cfg:vid:/, async ({ action, ack, respond, body }) => {
      await ack();
      const model = ((action as { value?: string }).value || '').slice(8);
      const settings = this.userSettings.get(body.user.id) || {
        imageModel: IMAGE_MODELS[0],
        videoModel: VIDEO_MODELS[0],
      };
      settings.videoModel = model;
      this.userSettings.set(body.user.id, settings);
      await respond({ text: `Video model set to: *${model}*` });
    });

    // Message handler for text input collection
    app.message(async ({ message, say }) => {
      const msg = message as { user?: string; text?: string };
      if (!msg.user || !msg.text) {
        return;
      }

      const session = this.getSession(msg.user);
      if (!session || session.state !== 'collecting') {
        return;
      }

      const currentInput = session.requiredInputs[session.currentInputIndex];
      if (!currentInput || currentInput.inputType !== 'text') {
        return;
      }

      let value = msg.text;
      if (value.toLowerCase() === 'default' && currentInput.defaultValue) {
        value = currentInput.defaultValue;
      }

      session.collectedInputs.set(currentInput.nodeId, value);
      session.currentInputIndex++;
      this.setSession(msg.user, session);

      await this.promptNextInput(msg.user, say);
    });

    // File handler for image uploads
    app.event('file_shared', async ({ event, client }) => {
      try {
        const fileInfo = await client.files.info({ file: event.file_id });
        const file = fileInfo.file;
        if (!file || !file.user) {
          return;
        }

        const session = this.getSession(file.user);
        if (!session || session.state !== 'collecting') {
          return;
        }

        const currentInput = session.requiredInputs[session.currentInputIndex];
        if (!currentInput || currentInput.inputType !== 'image') {
          return;
        }

        const imageUrl = file.url_private || '';
        session.collectedInputs.set(currentInput.nodeId, imageUrl);
        session.currentInputIndex++;
        this.setSession(file.user, session);

        const channel =
          file.channels && file.channels.length > 0
            ? file.channels[0]
            : undefined;
        if (channel) {
          await client.chat.postMessage({
            channel,
            text: 'Image received.',
          });
        }
      } catch (error) {
        this.logger.error('Failed to handle file upload:', error);
      }
    });

    await app.start();

    return {
      app,
      id: integration.id,
      integration,
      orgId: integration.orgId,
    };
  }

  async destroyBotInstance(botInstance: SlackBotInstance): Promise<void> {
    try {
      await botInstance.app.stop();
    } catch (error) {
      this.logger.error(`Error stopping bot ${botInstance.id}`, error);
    }
  }

  // --- Session helpers ---

  private getSession(userId: string): WorkflowSession | undefined {
    return this.sessions.get(userId);
  }

  private setSession(userId: string, session: WorkflowSession): void {
    this.sessions.set(userId, session);
  }

  private deleteSession(userId: string): void {
    this.sessions.delete(userId);
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
    this.logger.log('Subscribed to Slack integration Redis events');
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
          `${this.configService.API_URL}/v1/internal/integrations/slack`,
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
          `${this.configService.API_URL}/v1/internal/integrations/slack/${integrationId}`,
          {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
          },
        ),
      );
      const integration = this.normalizeIntegration(response.data);
      if (!integration) {
        this.logger.warn(
          `Unable to normalize Slack integration payload: ${integrationId}`,
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
          `${this.configService.API_URL}/v1/internal/integrations/slack/${integrationId}`,
          {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
          },
        ),
      );
      const integration = this.normalizeIntegration(response.data);
      if (!integration) {
        this.logger.warn(
          `Unable to normalize Slack integration payload: ${integrationId}`,
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

  private async handleWorkflowsCommand(
    userId: string,
    orgId: string,
    respond: (msg: any) => Promise<unknown>,
  ) {
    const session = this.getSession(userId);
    if (session?.state === 'running') {
      await respond({
        text: 'A workflow is running. Use /status to check progress or /cancel to abort.',
      });
      return;
    }

    try {
      const workflows = await this.fetchOrgWorkflows(orgId);

      if (workflows.length === 0) {
        await respond({
          text: 'No workflows available for your organization.',
        });
        return;
      }

      const blocks = [
        {
          text: {
            text: '*GenFeed AI Workflows*\nSelect a workflow to run:',
            type: 'mrkdwn',
          },
          type: 'section',
        },
        { type: 'divider' },
        ...workflows.map((wf) => ({
          accessory: {
            action_id: `wf:${wf.id}`,
            text: { text: 'Select', type: 'plain_text' },
            type: 'button',
            value: `wf:${wf.id}`,
          },
          text: {
            text: `*${wf.name}*${wf.description ? `\n${wf.description}` : ''}`,
            type: 'mrkdwn',
          },
          type: 'section',
        })),
      ];

      this.setSession(userId, {
        collectedInputs: new Map(),
        currentInputIndex: 0,
        orgId,
        requiredInputs: [],
        startedAt: Date.now(),
        state: 'selecting',
      });

      await respond({ blocks, text: 'GenFeed AI Workflows' });
    } catch (error) {
      this.logger.error('Failed to fetch workflows:', error);
      await respond({ text: 'Failed to load workflows. Please try again.' });
    }
  }

  private async handleStatusCommand(
    userId: string,
    respond: (msg: any) => Promise<unknown>,
  ) {
    const session = this.getSession(userId);

    let line = 'Idle - no active workflow';
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
          line = `Running *${session.workflowName}*`;
          if (session.executionId && session.orgId) {
            try {
              const execution = await this.getWorkflowExecution(
                session.orgId,
                session.executionId,
              );
              if (execution.status) {
                line = `Running *${session.workflowName}* (${execution.status})`;
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

    await respond({ text: `*GenFeed Bot Status*\n\nYour status: ${line}` });
  }

  private async handleCancelCommand(
    userId: string,
    respond: (msg: any) => Promise<unknown>,
  ) {
    const session = this.getSession(userId);
    if (!session || session.state === 'idle') {
      await respond({ text: 'Nothing to cancel.' });
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

    this.deleteSession(userId);
    await respond({ text: 'Cancelled. Use /workflows to start again.' });
  }

  private async handleSettingsCommand(
    userId: string,
    respond: (msg: any) => Promise<unknown>,
  ) {
    await this.showSettingsMenu(userId, respond);
  }

  private async selectWorkflow(
    userId: string,
    orgId: string,
    workflowId: string,
    respond: (msg: any) => Promise<unknown>,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.configService.API_URL}/v1/orgs/${orgId}/workflows/${workflowId}`,
        ),
      );

      const workflow: WorkflowDefinition = response.data;
      const requiredInputs = this.extractWorkflowInputs(workflow);

      const session = this.getSession(userId);
      if (!session) {
        return;
      }

      session.state = 'collecting';
      session.workflowId = workflowId;
      session.workflowName = workflow.name;
      session.requiredInputs = requiredInputs;
      session.currentInputIndex = 0;
      session.collectedInputs = new Map();
      this.setSession(userId, session);

      await respond({
        replace_original: true,
        text: `*${workflow.name}*\n${workflow.description || ''}\nThis workflow requires *${requiredInputs.length}* input(s).`,
      });

      await this.promptNextInput(userId, respond);
    } catch (error) {
      this.logger.error('Failed to select workflow:', error);
      await respond({
        text: 'Failed to load workflow details. Please try again.',
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
    userId: string,
    respond: (msg: any) => Promise<unknown>,
  ) {
    const session = this.getSession(userId);
    if (!session) {
      return;
    }

    if (session.currentInputIndex >= session.requiredInputs.length) {
      await this.showConfirmation(userId, respond);
      return;
    }

    const input = session.requiredInputs[session.currentInputIndex];
    const position = `(${session.currentInputIndex + 1}/${session.requiredInputs.length})`;

    if (input.inputType === 'image') {
      await respond({
        text: `*Input ${position}:* ${input.label}\n\nPlease upload a photo.`,
      });
    } else {
      const defaultHint = input.defaultValue
        ? `\nDefault: \`${input.defaultValue}\` (type "default" to use it)`
        : '';
      await respond({
        text: `*Input ${position}:* ${input.label}\n\nPlease enter a text value.${defaultHint}`,
      });
    }
  }

  private async showConfirmation(
    userId: string,
    respond: (msg: any) => Promise<unknown>,
  ) {
    const session = this.getSession(userId);
    if (!session) {
      return;
    }

    session.state = 'confirming';
    this.setSession(userId, session);

    const lines = [`*Workflow:* ${session.workflowName}\n`];
    for (const input of session.requiredInputs) {
      const value = session.collectedInputs.get(input.nodeId) || '(empty)';
      const displayValue =
        input.inputType === 'image' ? '[Image uploaded]' : value;
      lines.push(`*${input.label}:* ${displayValue}`);
    }

    const blocks = [
      {
        text: {
          text: `*Review your inputs:*\n\n${lines.join('\n')}`,
          type: 'mrkdwn',
        },
        type: 'section',
      },
      {
        elements: [
          {
            action_id: 'confirm:run',
            style: 'primary',
            text: { text: 'Run', type: 'plain_text' },
            type: 'button',
          },
          {
            action_id: 'confirm:edit',
            text: { text: 'Edit', type: 'plain_text' },
            type: 'button',
          },
          {
            action_id: 'confirm:cancel',
            style: 'danger',
            text: { text: 'Cancel', type: 'plain_text' },
            type: 'button',
          },
        ],
        type: 'actions',
      },
    ];

    await respond({ blocks, text: 'Review your inputs' });
  }

  private async handleRun(
    userId: string,
    orgId: string,
    respond: (msg: any) => Promise<unknown>,
  ) {
    const session = this.getSession(userId);
    if (!session || !session.workflowId) {
      await respond({ text: 'No workflow selected. Use /workflows to start.' });
      return;
    }

    session.state = 'running';
    this.setSession(userId, session);

    await respond({
      replace_original: true,
      text: `Running *${session.workflowName}*...\nUse /status to check progress.`,
    });

    try {
      const inputPayload: Record<string, string> = {};
      for (const [key, value] of session.collectedInputs.entries()) {
        inputPayload[key] = value;
      }

      const settings = this.userSettings.get(userId);
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
      this.setSession(userId, session);

      void this.monitorWorkflowExecution(orgId, userId, respond);
    } catch (error) {
      this.logger.error('Failed to execute workflow:', error);
      await respond({
        text: 'Workflow execution failed. Please try again.\nUse /workflows to start a new run.',
      });
      this.deleteSession(userId);
    }
  }

  private async handleEdit(
    userId: string,
    respond: (msg: any) => Promise<unknown>,
  ) {
    const session = this.getSession(userId);
    if (!session) {
      return;
    }

    session.currentInputIndex = 0;
    session.collectedInputs = new Map();
    session.state = 'collecting';
    this.setSession(userId, session);

    await respond({
      replace_original: true,
      text: "Inputs cleared. Let's start over.",
    });
    await this.promptNextInput(userId, respond);
  }

  private async showSettingsMenu(
    userId: string,
    respond: (msg: any) => Promise<unknown>,
  ) {
    const current = this.userSettings.get(userId) || {
      imageModel: IMAGE_MODELS[0],
      videoModel: VIDEO_MODELS[0],
    };

    const imageElements = IMAGE_MODELS.map((model) => ({
      action_id: `cfg:img:${model}`,
      text: {
        text: model === current.imageModel ? `[${model}]` : model,
        type: 'plain_text',
      },
      type: 'button',
      value: `cfg:img:${model}`,
    }));

    const videoElements = VIDEO_MODELS.map((model) => ({
      action_id: `cfg:vid:${model}`,
      text: {
        text: model === current.videoModel ? `[${model}]` : model,
        type: 'plain_text',
      },
      type: 'button',
      value: `cfg:vid:${model}`,
    }));

    const blocks = [
      {
        text: { text: '*Image Model:*', type: 'mrkdwn' },
        type: 'section',
      },
      { elements: imageElements, type: 'actions' },
      { type: 'divider' },
      {
        text: { text: '*Video Model:*', type: 'mrkdwn' },
        type: 'section',
      },
      { elements: videoElements, type: 'actions' },
    ];

    await respond({ blocks, text: 'Settings' });
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
    userId: string,
    respond: (msg: any) => Promise<unknown>,
  ): Promise<void> {
    const session = this.getSession(userId);
    if (!session?.executionId) {
      return;
    }

    try {
      const execution = await this.waitForWorkflowExecution(
        orgId,
        session.executionId,
      );

      if (execution.status === 'cancelled') {
        this.deleteSession(userId);
        return;
      }

      if (execution.status === 'failed') {
        await respond({
          text:
            execution.error ||
            'Workflow execution failed. Please try again.\nUse /workflows to start a new run.',
        });
        this.deleteSession(userId);
        return;
      }

      const outputs = extractWorkflowOutputsFromExecution(execution);

      if (outputs.length > 0) {
        for (const output of outputs) {
          if (output.url) {
            await respond({
              text: `${output.caption || `Generated ${output.type}`}\n${output.url}`,
            });
          } else if (output.text) {
            await respond({ text: output.text });
          }
        }
      } else {
        await respond({ text: 'Workflow completed successfully.' });
      }

      this.deleteSession(userId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Workflow execution polling timed out'
      ) {
        await respond({
          text: 'Workflow is still running. Use /status to check progress.',
        });
        return;
      }

      this.logger.error('Failed while monitoring workflow execution:', error);
      await respond({
        text: 'Workflow execution failed. Please try again.\nUse /workflows to start a new run.',
      });
      this.deleteSession(userId);
    }
  }
}
