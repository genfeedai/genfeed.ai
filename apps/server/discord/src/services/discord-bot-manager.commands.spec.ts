import { ConfigService } from '@discord/config/config.service';
import { DiscordBotManager } from '@discord/services/discord-bot-manager.service';
import type { DiscordWorkflowExecutionClient } from '@discord/services/discord-workflow-execution.client';
import type {
  BotInternalApiClient,
  OrgIntegration,
  UserSettings,
  WorkflowInput,
  WorkflowSession,
} from '@genfeedai/integrations';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Message } from 'discord.js';
import { of, throwError } from 'rxjs';

const { mockClient, mockRest } = vi.hoisted(() => ({
  mockClient: {
    destroy: vi.fn(),
    login: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
  },
  mockRest: {
    put: vi.fn().mockResolvedValue([]),
    setToken: vi.fn().mockReturnThis(),
  },
}));

vi.mock('discord.js', () => {
  // The service invokes each of these builders with `new`. A `vi.fn()` spy
  // called with `new` runs its implementation through `Reflect.construct`, and
  // arrow functions are not constructible — so every implementation has to be a
  // real function. Declarations, not expressions: Biome's `useArrowFunction`
  // autofix rewrites function *expressions* straight back to arrows.
  function ActionRowBuilderImpl() {
    return { addComponents: vi.fn().mockReturnThis() };
  }
  function ButtonBuilderImpl() {
    return {
      setCustomId: vi.fn().mockReturnThis(),
      setLabel: vi.fn().mockReturnThis(),
      setStyle: vi.fn().mockReturnThis(),
    };
  }
  function ClientImpl() {
    return mockClient;
  }
  function RestImpl() {
    return mockRest;
  }
  function SlashCommandBuilderImpl() {
    return {
      setDescription: vi.fn().mockReturnThis(),
      setName: vi.fn().mockReturnThis(),
      toJSON: vi.fn().mockReturnValue({}),
    };
  }

  return {
    ActionRowBuilder: vi.fn(ActionRowBuilderImpl),
    BaseGuildTextChannel: class BaseGuildTextChannel {},
    ButtonBuilder: vi.fn(ButtonBuilderImpl),
    ButtonStyle: { Danger: 4, Primary: 1, Secondary: 2, Success: 3 },
    Client: vi.fn(ClientImpl),
    Events: { ClientReady: 'clientReady' },
    GatewayIntentBits: {
      DirectMessages: 4,
      GuildMessages: 2,
      Guilds: 1,
      MessageContent: 3,
    },
    REST: vi.fn(RestImpl),
    Routes: { applicationCommands: vi.fn().mockReturnValue('/commands') },
    SlashCommandBuilder: vi.fn(SlashCommandBuilderImpl),
  };
});

interface ManagerLoggerMocks {
  debug: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
}

interface MessagePayload {
  components?: unknown[];
  content?: string;
  ephemeral?: boolean;
}

interface CommandInteraction {
  channel?: { send?: ReturnType<typeof vi.fn> } | null;
  channelId: string | null;
  customId?: string;
  deferReply?: ReturnType<typeof vi.fn>;
  deferUpdate?: ReturnType<typeof vi.fn>;
  editReply?: ReturnType<typeof vi.fn>;
  reply?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  user: { id: string };
}

/** Typed access to the manager's private surface for white-box unit tests. */
interface ManagerInternals {
  extractWorkflowInputs(workflow: {
    id: string;
    name: string;
    nodes?: Record<
      string,
      {
        type: string;
        data?: {
          label?: string;
          inputType?: 'text' | 'image';
          defaultValue?: string;
          required?: boolean;
        };
      }
    >;
  }): WorkflowInput[];
  fetchActiveIntegrations(): Promise<OrgIntegration[]>;
  fetchAndAddIntegration(integrationId: string): Promise<void>;
  fetchAndUpdateIntegration(integrationId: string): Promise<void>;
  fetchOrgWorkflows(orgId: string): Promise<Array<{ id: string }>>;
  handleAttachmentInput(message: Message, sessionKey: string): Promise<void>;
  handleButtonInteraction(
    interaction: CommandInteraction,
    orgId: string,
  ): Promise<void>;
  handleCancelCommand(interaction: CommandInteraction): Promise<void>;
  handleEdit(interaction: CommandInteraction): Promise<void>;
  handleRun(interaction: CommandInteraction, orgId: string): Promise<void>;
  handleSettingsCommand(interaction: CommandInteraction): Promise<void>;
  handleStatusCommand(interaction: CommandInteraction): Promise<void>;
  handleTextInput(message: Message, sessionKey: string): Promise<void>;
  handleWorkflowsCommand(
    interaction: CommandInteraction,
    orgId: string,
  ): Promise<void>;
  internalApiClient: BotInternalApiClient;
  logger: ManagerLoggerMocks;
  monitorWorkflowExecution(
    orgId: string,
    sessionKey: string,
    send: (msg: string) => Promise<unknown>,
  ): Promise<void>;
  promptNextInput(
    sessionKey: string,
    channel: { editReply?: ReturnType<typeof vi.fn> },
  ): Promise<void>;
  promptNextInputViaChannel(
    sessionKey: string,
    channel: { send: ReturnType<typeof vi.fn> },
  ): Promise<void>;
  registerSlashCommands(clientId: string, botToken: string): Promise<void>;
  sessions: Map<string, WorkflowSession>;
  userSettings: Map<string, UserSettings>;
  workflowExecutionClient: DiscordWorkflowExecutionClient;
}

const SESSION_KEY = 'ch-1:user-1';

function createSession(overrides: Partial<WorkflowSession>): WorkflowSession {
  return {
    collectedInputs: new Map(),
    currentInputIndex: 0,
    orgId: 'org-1',
    requiredInputs: [],
    startedAt: Date.now(),
    state: 'collecting',
    ...overrides,
  };
}

function createMessage(overrides: {
  attachments?: Map<string, { url: string }>;
  content?: string;
  isSendable?: boolean;
  send?: ReturnType<typeof vi.fn>;
}): Message {
  const send = overrides.send ?? vi.fn().mockResolvedValue(undefined);
  return {
    attachments: overrides.attachments ?? new Map<string, { url: string }>(),
    channel: {
      isSendable: vi.fn().mockReturnValue(overrides.isSendable ?? true),
      send,
    },
    content: overrides.content ?? '',
  } as unknown as Message;
}

const mockIntegration: OrgIntegration = {
  botToken: 'bot-token',
  config: { allowedUserIds: ['user-1'] },
  createdAt: new Date('2026-01-01'),
  id: 'int-1',
  orgId: 'org-1',
  platform: 'DISCORD',
  status: 'ACTIVE',
  updatedAt: new Date('2026-01-01'),
};

describe('DiscordBotManager command handlers', () => {
  let service: DiscordBotManager;
  let internals: ManagerInternals;
  let httpService: { get: ReturnType<typeof vi.fn> };
  let logger: ManagerLoggerMocks;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRest.put.mockResolvedValue([]);
    mockRest.setToken.mockReturnThis();

    httpService = { get: vi.fn() };
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordBotManager,
        { provide: LoggerService, useValue: logger },
        {
          provide: ConfigService,
          useValue: { API_KEY: 'test-key', API_URL: 'http://api.test' },
        },
        { provide: HttpService, useValue: httpService },
        {
          provide: RedisService,
          useValue: { subscribe: vi.fn(), unsubscribe: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<DiscordBotManager>(DiscordBotManager);
    internals = service as unknown as ManagerInternals;
    internals.logger = logger;
  });

  describe('registerSlashCommands', () => {
    it('should register the four slash commands', async () => {
      await internals.registerSlashCommands('client-1', 'bot-token');

      expect(mockRest.setToken).toHaveBeenCalledWith('bot-token');
      expect(mockRest.put).toHaveBeenCalledWith('/commands', {
        body: [{}, {}, {}, {}],
      });
      expect(logger.log).toHaveBeenCalledWith(
        'Registered slash commands for bot client-1',
      );
    });

    it('should log and swallow registration failures', async () => {
      const error = new Error('rate limited');
      mockRest.put.mockRejectedValueOnce(error);

      await internals.registerSlashCommands('client-1', 'bot-token');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to register slash commands:',
        expect.objectContaining({ message: error.message }),
      );
    });
  });

  describe('handleWorkflowsCommand', () => {
    function createWorkflowsInteraction(): CommandInteraction {
      return {
        channelId: 'ch-1',
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        user: { id: 'user-1' },
      };
    }

    it('should refuse to start while a workflow is running', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({ state: 'running', workflowName: 'Image Gen' }),
      );
      const interaction = createWorkflowsInteraction();

      await internals.handleWorkflowsCommand(interaction, 'org-1');

      expect(interaction.editReply).toHaveBeenCalledWith(
        'A workflow is running. Use /status to check progress or /cancel to abort.',
      );
    });

    it('should report when no workflows exist', async () => {
      vi.spyOn(
        internals.internalApiClient,
        'fetchOrgWorkflows',
      ).mockResolvedValue([]);
      const interaction = createWorkflowsInteraction();

      await internals.handleWorkflowsCommand(interaction, 'org-1');

      expect(interaction.editReply).toHaveBeenCalledWith(
        'No workflows available for your organization.',
      );
      expect(internals.sessions.has(SESSION_KEY)).toBe(false);
    });

    it('should list workflows as buttons and open a selecting session', async () => {
      vi.spyOn(
        internals.internalApiClient,
        'fetchOrgWorkflows',
      ).mockResolvedValue([
        { id: 'wf-1', name: 'Image Gen' },
        { id: 'wf-2', name: 'Video Gen' },
      ]);
      const interaction = createWorkflowsInteraction();

      await internals.handleWorkflowsCommand(interaction, 'org-1');

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.any(Array),
          content: expect.stringContaining('GenFeed AI Workflows'),
        }),
      );
      const session = internals.sessions.get(SESSION_KEY);
      expect(session?.state).toBe('selecting');
      expect(session?.orgId).toBe('org-1');
    });

    it('should cap the button grid at five rows of five', async () => {
      const workflows = Array.from({ length: 30 }, (_, index) => ({
        id: `wf-${index}`,
        name: `Workflow ${index}`,
      }));
      vi.spyOn(
        internals.internalApiClient,
        'fetchOrgWorkflows',
      ).mockResolvedValue(workflows);
      const interaction = createWorkflowsInteraction();

      await internals.handleWorkflowsCommand(interaction, 'org-1');

      const payload = interaction.editReply?.mock.calls[0][0] as MessagePayload;
      expect(payload.components).toHaveLength(5);
    });

    it('should report a failure when replying blows up', async () => {
      vi.spyOn(
        internals.internalApiClient,
        'fetchOrgWorkflows',
      ).mockResolvedValue([{ id: 'wf-1', name: 'Image Gen' }]);
      const interaction = createWorkflowsInteraction();
      interaction.editReply
        ?.mockRejectedValueOnce(new Error('discord down'))
        .mockResolvedValueOnce(undefined);

      await internals.handleWorkflowsCommand(interaction, 'org-1');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch workflows:',
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(interaction.editReply).toHaveBeenLastCalledWith(
        'Failed to load workflows. Please try again.',
      );
    });
  });

  describe('handleStatusCommand', () => {
    function createReplyInteraction(): CommandInteraction {
      return {
        channelId: 'ch-1',
        reply: vi.fn().mockResolvedValue(undefined),
        user: { id: 'user-1' },
      };
    }

    it('should report idle without a session', async () => {
      const interaction = createReplyInteraction();

      await internals.handleStatusCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.stringContaining('Idle — no active workflow'),
      );
    });

    it.each([
      ['selecting', 'Selecting a workflow'],
      ['confirming', 'Waiting for confirmation'],
    ] as const)('should report the %s state', async (state, expected) => {
      internals.sessions.set(SESSION_KEY, createSession({ state }));
      const interaction = createReplyInteraction();

      await internals.handleStatusCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.stringContaining(expected),
      );
    });

    it('should report collecting progress', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({
          currentInputIndex: 1,
          requiredInputs: [
            { inputType: 'text', label: 'A', nodeId: 'a' },
            { inputType: 'text', label: 'B', nodeId: 'b' },
          ],
          state: 'collecting',
        }),
      );
      const interaction = createReplyInteraction();

      await internals.handleStatusCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.stringContaining('Collecting inputs (1/2)'),
      );
    });

    it('should report the live execution status when running', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({
          executionId: 'exec-1',
          state: 'running',
          workflowName: 'Image Gen',
        }),
      );
      vi.spyOn(internals.workflowExecutionClient, 'get').mockResolvedValue({
        nodeResults: [],
        status: 'processing',
      });
      const interaction = createReplyInteraction();

      await internals.handleStatusCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.stringContaining('Running **Image Gen** (processing)'),
      );
    });

    it('should keep the base line when the execution has no status', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({
          executionId: 'exec-1',
          state: 'running',
          workflowName: 'Image Gen',
        }),
      );
      vi.spyOn(internals.workflowExecutionClient, 'get').mockResolvedValue({
        nodeResults: [],
      });
      const interaction = createReplyInteraction();

      await internals.handleStatusCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.stringContaining('Running **Image Gen**'),
      );
    });

    it('should warn and fall back when the status fetch fails', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({
          executionId: 'exec-1',
          state: 'running',
          workflowName: 'Image Gen',
        }),
      );
      vi.spyOn(internals.workflowExecutionClient, 'get').mockRejectedValue(
        new Error('api down'),
      );
      const interaction = createReplyInteraction();

      await internals.handleStatusCommand(interaction);

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to fetch workflow execution status',
        expect.objectContaining({ executionId: 'exec-1' }),
      );
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.stringContaining('Running **Image Gen**'),
      );
    });
  });

  describe('handleCancelCommand', () => {
    function createReplyInteraction(): CommandInteraction {
      return {
        channelId: 'ch-1',
        reply: vi.fn().mockResolvedValue(undefined),
        user: { id: 'user-1' },
      };
    }

    it('should report nothing to cancel without a session', async () => {
      const interaction = createReplyInteraction();

      await internals.handleCancelCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledWith('Nothing to cancel.');
    });

    it('should report nothing to cancel for an idle session', async () => {
      internals.sessions.set(SESSION_KEY, createSession({ state: 'idle' }));
      const interaction = createReplyInteraction();

      await internals.handleCancelCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledWith('Nothing to cancel.');
    });

    it('should cancel the running execution and clear the session', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({ executionId: 'exec-1', state: 'running' }),
      );
      const cancelSpy = vi
        .spyOn(internals.workflowExecutionClient, 'cancel')
        .mockResolvedValue(undefined);
      const interaction = createReplyInteraction();

      await internals.handleCancelCommand(interaction);

      expect(cancelSpy).toHaveBeenCalledWith('org-1', 'exec-1');
      expect(internals.sessions.has(SESSION_KEY)).toBe(false);
      expect(interaction.reply).toHaveBeenCalledWith(
        'Cancelled. Use /workflows to start again.',
      );
    });

    it('should still clear the session when cancelling the execution fails', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({ executionId: 'exec-1', state: 'running' }),
      );
      vi.spyOn(internals.workflowExecutionClient, 'cancel').mockRejectedValue(
        new Error('api down'),
      );
      const interaction = createReplyInteraction();

      await internals.handleCancelCommand(interaction);

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to cancel workflow execution',
        expect.objectContaining({ executionId: 'exec-1' }),
      );
      expect(internals.sessions.has(SESSION_KEY)).toBe(false);
    });

    it('should clear a collecting session without touching the API', async () => {
      internals.sessions.set(SESSION_KEY, createSession({}));
      const cancelSpy = vi.spyOn(internals.workflowExecutionClient, 'cancel');
      const interaction = createReplyInteraction();

      await internals.handleCancelCommand(interaction);

      expect(cancelSpy).not.toHaveBeenCalled();
      expect(internals.sessions.has(SESSION_KEY)).toBe(false);
    });
  });

  describe('handleSettingsCommand', () => {
    it('should render defaults when the user has no settings', async () => {
      const interaction: CommandInteraction = {
        channelId: 'ch-1',
        reply: vi.fn().mockResolvedValue(undefined),
        user: { id: 'user-1' },
      };

      await internals.handleSettingsCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.any(Array),
          content: expect.stringContaining('Settings'),
        }),
      );
    });

    it('should highlight the stored user settings', async () => {
      internals.userSettings.set('user-1', {
        imageModel: 'sdxl',
        videoModel: 'kling',
      });
      const interaction: CommandInteraction = {
        channelId: 'ch-1',
        reply: vi.fn().mockResolvedValue(undefined),
        user: { id: 'user-1' },
      };

      await internals.handleSettingsCommand(interaction);

      expect(interaction.reply).toHaveBeenCalled();
    });
  });

  describe('handleButtonInteraction', () => {
    function createButtonInteraction(customId: string): CommandInteraction {
      return {
        channelId: 'ch-1',
        customId,
        deferUpdate: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        user: { id: 'user-1' },
      };
    }

    it('should select a workflow and prompt for the first input', async () => {
      httpService.get.mockReturnValue(
        of({
          data: {
            description: 'Makes images',
            id: 'wf-1',
            name: 'Image Gen',
            nodes: {
              'node-image': {
                data: { inputType: 'image', label: 'Reference' },
                type: 'input',
              },
              'node-output': { type: 'output' },
              'node-prompt': {
                data: {
                  defaultValue: 'a panda',
                  inputType: 'text',
                  label: 'Prompt',
                },
                type: 'input',
              },
              'node-untyped': { type: 'input' },
            },
          },
        }),
      );
      const interaction = createButtonInteraction('wf:wf-1');

      await internals.handleButtonInteraction(interaction, 'org-1');

      expect(httpService.get).toHaveBeenCalledWith(
        'http://api.test/v1/orgs/org-1/workflows/wf-1',
      );
      const session = internals.sessions.get(SESSION_KEY);
      expect(session?.state).toBe('collecting');
      expect(session?.requiredInputs).toHaveLength(2);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('requires **2** input(s)'),
        }),
      );
      expect(interaction.editReply).toHaveBeenLastCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Please upload an image.'),
        }),
      );
    });

    it('should report workflow load failures', async () => {
      httpService.get.mockReturnValue(throwError(() => new Error('not found')));
      const interaction = createButtonInteraction('wf:wf-404');

      await internals.handleButtonInteraction(interaction, 'org-1');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to select workflow:',
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(interaction.editReply).toHaveBeenCalledWith({
        components: [],
        content: 'Failed to load workflow details. Please try again.',
      });
    });

    it('should cancel the flow on confirm:cancel', async () => {
      internals.sessions.set(SESSION_KEY, createSession({}));
      const interaction = createButtonInteraction('confirm:cancel');

      await internals.handleButtonInteraction(interaction, 'org-1');

      expect(internals.sessions.has(SESSION_KEY)).toBe(false);
      expect(interaction.update).toHaveBeenCalledWith({
        components: [],
        content: 'Cancelled. Use /workflows to start again.',
      });
    });

    it('should store the image model on cfg:img buttons', async () => {
      const interaction = createButtonInteraction('cfg:img:sdxl');

      await internals.handleButtonInteraction(interaction, 'org-1');

      expect(internals.userSettings.get('user-1')?.imageModel).toBe('sdxl');
      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Image model set to: **sdxl**',
        ephemeral: true,
      });
    });

    it('should store the video model on cfg:vid buttons', async () => {
      internals.userSettings.set('user-1', {
        imageModel: 'sdxl',
        videoModel: 'runway',
      });
      const interaction = createButtonInteraction('cfg:vid:kling');

      await internals.handleButtonInteraction(interaction, 'org-1');

      expect(internals.userSettings.get('user-1')?.videoModel).toBe('kling');
      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Video model set to: **kling**',
        ephemeral: true,
      });
    });

    it('should ignore unknown custom ids', async () => {
      const interaction = createButtonInteraction('something:else');

      await internals.handleButtonInteraction(interaction, 'org-1');

      expect(interaction.reply).not.toHaveBeenCalled();
      expect(interaction.update).not.toHaveBeenCalled();
    });
  });

  describe('promptNextInput', () => {
    it('should do nothing without a session', async () => {
      const editReply = vi.fn();

      await internals.promptNextInput(SESSION_KEY, { editReply });

      expect(editReply).not.toHaveBeenCalled();
    });

    it('should include the default hint for text inputs', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({
          requiredInputs: [
            {
              defaultValue: 'a panda',
              inputType: 'text',
              label: 'Prompt',
              nodeId: 'node-1',
            },
          ],
        }),
      );
      const editReply = vi.fn().mockResolvedValue(undefined);

      await internals.promptNextInput(SESSION_KEY, { editReply });

      expect(editReply).toHaveBeenCalledWith({
        components: [],
        content: expect.stringContaining('Default: `a panda`'),
      });
    });

    it('should show the confirmation once all inputs are collected', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({
          collectedInputs: new Map([['node-1', 'value']]),
          currentInputIndex: 1,
          requiredInputs: [
            { inputType: 'text', label: 'Prompt', nodeId: 'node-1' },
          ],
          workflowName: 'Image Gen',
        }),
      );
      const editReply = vi.fn().mockResolvedValue(undefined);

      await internals.promptNextInput(SESSION_KEY, { editReply });

      expect(internals.sessions.get(SESSION_KEY)?.state).toBe('confirming');
      expect(editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Review your inputs'),
        }),
      );
    });

    it('should tolerate channels without editReply', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({
          requiredInputs: [
            { inputType: 'image', label: 'Reference', nodeId: 'node-1' },
          ],
        }),
      );

      await expect(
        internals.promptNextInput(SESSION_KEY, {}),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleTextInput', () => {
    it('should ignore messages without a collecting session', async () => {
      const send = vi.fn().mockResolvedValue(undefined);
      const message = createMessage({ content: 'hello', send });

      await internals.handleTextInput(message, SESSION_KEY);

      expect(send).not.toHaveBeenCalled();
    });

    it('should ignore text while an image input is expected', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({
          requiredInputs: [
            { inputType: 'image', label: 'Reference', nodeId: 'node-1' },
          ],
        }),
      );
      const message = createMessage({ content: 'hello' });

      await internals.handleTextInput(message, SESSION_KEY);

      expect(internals.sessions.get(SESSION_KEY)?.collectedInputs.size).toBe(0);
    });

    it('should ignore non-sendable channels', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({
          requiredInputs: [
            { inputType: 'text', label: 'Prompt', nodeId: 'node-1' },
          ],
        }),
      );
      const message = createMessage({ content: 'hello', isSendable: false });

      await internals.handleTextInput(message, SESSION_KEY);

      expect(internals.sessions.get(SESSION_KEY)?.collectedInputs.size).toBe(0);
    });

    it('should substitute the default value when the user types default', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({
          requiredInputs: [
            {
              defaultValue: 'a panda',
              inputType: 'text',
              label: 'Prompt',
              nodeId: 'node-1',
            },
            { inputType: 'text', label: 'Style', nodeId: 'node-2' },
          ],
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      const message = createMessage({ content: 'DEFAULT', send });

      await internals.handleTextInput(message, SESSION_KEY);

      const session = internals.sessions.get(SESSION_KEY);
      expect(session?.collectedInputs.get('node-1')).toBe('a panda');
      expect(session?.currentInputIndex).toBe(1);
      expect(send).toHaveBeenCalledWith(
        expect.stringContaining('**Input (2/2):** Style'),
      );
    });

    it('should collect the value and show the confirmation when done', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({
          requiredInputs: [
            { inputType: 'text', label: 'Prompt', nodeId: 'node-1' },
          ],
          workflowName: 'Image Gen',
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      const message = createMessage({ content: 'a red panda', send });

      await internals.handleTextInput(message, SESSION_KEY);

      const session = internals.sessions.get(SESSION_KEY);
      expect(session?.collectedInputs.get('node-1')).toBe('a red panda');
      expect(session?.state).toBe('confirming');
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Review your inputs'),
        }),
      );
    });
  });

  describe('handleAttachmentInput', () => {
    it('should ignore attachments without a collecting session', async () => {
      const send = vi.fn().mockResolvedValue(undefined);
      const message = createMessage({
        attachments: new Map([['a-1', { url: 'https://cdn/img.png' }]]),
        send,
      });

      await internals.handleAttachmentInput(message, SESSION_KEY);

      expect(send).not.toHaveBeenCalled();
    });

    it('should ignore attachments while a text input is expected', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({
          requiredInputs: [
            { inputType: 'text', label: 'Prompt', nodeId: 'node-1' },
          ],
        }),
      );
      const message = createMessage({
        attachments: new Map([['a-1', { url: 'https://cdn/img.png' }]]),
      });

      await internals.handleAttachmentInput(message, SESSION_KEY);

      expect(internals.sessions.get(SESSION_KEY)?.collectedInputs.size).toBe(0);
    });

    it('should ignore messages without an attachment payload', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({
          requiredInputs: [
            { inputType: 'image', label: 'Reference', nodeId: 'node-1' },
          ],
        }),
      );
      const message = createMessage({});

      await internals.handleAttachmentInput(message, SESSION_KEY);

      expect(internals.sessions.get(SESSION_KEY)?.collectedInputs.size).toBe(0);
    });

    it('should store the attachment url and prompt the next input', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({
          requiredInputs: [
            { inputType: 'image', label: 'Reference', nodeId: 'node-1' },
            { inputType: 'image', label: 'Mask', nodeId: 'node-2' },
          ],
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      const message = createMessage({
        attachments: new Map([['a-1', { url: 'https://cdn/img.png' }]]),
        send,
      });

      await internals.handleAttachmentInput(message, SESSION_KEY);

      const session = internals.sessions.get(SESSION_KEY);
      expect(session?.collectedInputs.get('node-1')).toBe(
        'https://cdn/img.png',
      );
      expect(send).toHaveBeenCalledWith('Image received.');
      expect(send).toHaveBeenCalledWith(
        expect.stringContaining('Please upload an image.'),
      );
    });
  });

  describe('promptNextInputViaChannel', () => {
    it('should do nothing without a session', async () => {
      const send = vi.fn();

      await internals.promptNextInputViaChannel(SESSION_KEY, { send });

      expect(send).not.toHaveBeenCalled();
    });

    it('should include the default hint for text inputs', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({
          requiredInputs: [
            {
              defaultValue: 'a panda',
              inputType: 'text',
              label: 'Prompt',
              nodeId: 'node-1',
            },
          ],
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);

      await internals.promptNextInputViaChannel(SESSION_KEY, { send });

      expect(send).toHaveBeenCalledWith(
        expect.stringContaining('Default: `a panda`'),
      );
    });
  });

  describe('handleRun', () => {
    function createRunInteraction(
      sendMock?: ReturnType<typeof vi.fn> | null,
    ): CommandInteraction {
      return {
        channel: sendMock === null ? null : { send: sendMock },
        channelId: 'ch-1',
        deferUpdate: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        user: { id: 'user-1' },
      };
    }

    it('should refuse to run without a selected workflow', async () => {
      const interaction = createRunInteraction();

      await internals.handleRun(interaction, 'org-1');

      expect(interaction.update).toHaveBeenCalledWith({
        components: [],
        content: 'No workflow selected. Use /workflows to start.',
      });
    });

    it('should start the execution with collected inputs and user settings', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({
          collectedInputs: new Map([['node-1', 'a red panda']]),
          state: 'confirming',
          workflowId: 'wf-1',
          workflowName: 'Image Gen',
        }),
      );
      internals.userSettings.set('user-1', {
        imageModel: 'sdxl',
        videoModel: 'kling',
      });
      const createSpy = vi
        .spyOn(internals.workflowExecutionClient, 'create')
        .mockResolvedValue('exec-1');
      vi.spyOn(
        internals.workflowExecutionClient,
        'waitForTerminal',
      ).mockResolvedValue({ nodeResults: [], status: 'completed' });
      const send = vi.fn().mockResolvedValue(undefined);
      const interaction = createRunInteraction(send);

      await internals.handleRun(interaction, 'org-1');
      await new Promise((resolve) => setImmediate(resolve));

      expect(createSpy).toHaveBeenCalledWith(
        'org-1',
        'wf-1',
        { 'node-1': 'a red panda' },
        { imageModel: 'sdxl', videoModel: 'kling' },
      );
      expect(interaction.update).toHaveBeenCalledWith({
        components: [],
        content: 'Running **Image Gen**...\nUse /status to check progress.',
      });
      expect(send).toHaveBeenCalledWith('Workflow completed successfully.');
      expect(internals.sessions.has(SESSION_KEY)).toBe(false);
    });

    it('should omit metadata and monitoring when there are no settings or channel', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({ state: 'confirming', workflowId: 'wf-1' }),
      );
      const createSpy = vi
        .spyOn(internals.workflowExecutionClient, 'create')
        .mockResolvedValue('exec-1');
      const interaction = createRunInteraction(null);

      await internals.handleRun(interaction, 'org-1');

      expect(createSpy).toHaveBeenCalledWith('org-1', 'wf-1', {}, undefined);
      expect(internals.sessions.get(SESSION_KEY)?.executionId).toBe('exec-1');
    });

    it('should notify and clear the session when starting fails', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({ state: 'confirming', workflowId: 'wf-1' }),
      );
      vi.spyOn(internals.workflowExecutionClient, 'create').mockRejectedValue(
        new Error('no credits'),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      const interaction = createRunInteraction(send);

      await internals.handleRun(interaction, 'org-1');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to execute workflow:',
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(send).toHaveBeenCalledWith(expect.stringContaining('Run failed'));
      expect(internals.sessions.has(SESSION_KEY)).toBe(false);
    });

    it('should clear the session on failure even without a channel', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({ state: 'confirming', workflowId: 'wf-1' }),
      );
      vi.spyOn(internals.workflowExecutionClient, 'create').mockRejectedValue(
        new Error('no credits'),
      );
      const interaction = createRunInteraction(null);

      await internals.handleRun(interaction, 'org-1');

      expect(internals.sessions.has(SESSION_KEY)).toBe(false);
    });
  });

  describe('monitorWorkflowExecution', () => {
    it('should do nothing without an execution id', async () => {
      internals.sessions.set(SESSION_KEY, createSession({ state: 'running' }));
      const send = vi.fn();

      await internals.monitorWorkflowExecution('org-1', SESSION_KEY, send);

      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('handleEdit', () => {
    it('should do nothing without a session', async () => {
      const interaction: CommandInteraction = {
        channelId: 'ch-1',
        deferUpdate: vi.fn(),
        editReply: vi.fn(),
        update: vi.fn(),
        user: { id: 'user-1' },
      };

      await internals.handleEdit(interaction);

      expect(interaction.update).not.toHaveBeenCalled();
    });

    it('should reset collected inputs and restart collection', async () => {
      internals.sessions.set(
        SESSION_KEY,
        createSession({
          collectedInputs: new Map([['node-1', 'old value']]),
          currentInputIndex: 1,
          requiredInputs: [
            { inputType: 'text', label: 'Prompt', nodeId: 'node-1' },
          ],
          state: 'confirming',
        }),
      );
      const interaction: CommandInteraction = {
        channelId: 'ch-1',
        deferUpdate: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        user: { id: 'user-1' },
      };

      await internals.handleEdit(interaction);

      const session = internals.sessions.get(SESSION_KEY);
      expect(session?.state).toBe('collecting');
      expect(session?.currentInputIndex).toBe(0);
      expect(session?.collectedInputs.size).toBe(0);
      expect(interaction.update).toHaveBeenCalledWith({
        components: [],
        content: "Inputs cleared. Let's start over.",
      });
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('**Input (1/1):** Prompt'),
        }),
      );
    });
  });

  describe('API fetch fallbacks', () => {
    it('should warn on ECONNREFUSED and start with zero bots', async () => {
      vi.spyOn(
        internals.internalApiClient,
        'fetchActiveIntegrations',
      ).mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:3010'));

      const integrations = await internals.fetchActiveIntegrations();

      expect(integrations).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('API unavailable at http://api.test'),
      );
    });

    it('should warn on 401 responses', async () => {
      const error = Object.assign(new Error('Request failed'), {
        response: { status: 401 },
      });
      vi.spyOn(
        internals.internalApiClient,
        'fetchActiveIntegrations',
      ).mockRejectedValue(error);

      const integrations = await internals.fetchActiveIntegrations();

      expect(integrations).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('GENFEEDAI_API_KEY'),
      );
    });

    it('should log unexpected integration fetch errors', async () => {
      const error = new Error('boom');
      vi.spyOn(
        internals.internalApiClient,
        'fetchActiveIntegrations',
      ).mockRejectedValue(error);

      const integrations = await internals.fetchActiveIntegrations();

      expect(integrations).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch integrations:',
        expect.objectContaining({ message: error.message }),
      );
    });

    it('should add the integration returned by fetchAndAddIntegration', async () => {
      vi.spyOn(
        internals.internalApiClient,
        'fetchIntegration',
      ).mockResolvedValue(mockIntegration);
      const addSpy = vi
        .spyOn(service, 'addIntegration')
        .mockResolvedValue(undefined);

      await internals.fetchAndAddIntegration('int-1');

      expect(addSpy).toHaveBeenCalledWith(mockIntegration);
    });

    it('should warn when fetchAndAddIntegration cannot normalize the payload', async () => {
      vi.spyOn(
        internals.internalApiClient,
        'fetchIntegration',
      ).mockResolvedValue(null);
      const addSpy = vi.spyOn(service, 'addIntegration');

      await internals.fetchAndAddIntegration('int-1');

      expect(addSpy).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Unable to normalize Discord integration payload: int-1',
      );
    });

    it('should log when fetchAndAddIntegration fails', async () => {
      const error = new Error('boom');
      vi.spyOn(
        internals.internalApiClient,
        'fetchIntegration',
      ).mockRejectedValue(error);

      await internals.fetchAndAddIntegration('int-1');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch and add integration int-1:',
        expect.objectContaining({ message: error.message }),
      );
    });

    it('should update the integration returned by fetchAndUpdateIntegration', async () => {
      vi.spyOn(
        internals.internalApiClient,
        'fetchIntegration',
      ).mockResolvedValue(mockIntegration);
      const updateSpy = vi
        .spyOn(service, 'updateIntegration')
        .mockResolvedValue(undefined);

      await internals.fetchAndUpdateIntegration('int-1');

      expect(updateSpy).toHaveBeenCalledWith(mockIntegration);
    });

    it('should warn when fetchAndUpdateIntegration cannot normalize the payload', async () => {
      vi.spyOn(
        internals.internalApiClient,
        'fetchIntegration',
      ).mockResolvedValue(null);

      await internals.fetchAndUpdateIntegration('int-1');

      expect(logger.warn).toHaveBeenCalledWith(
        'Unable to normalize Discord integration payload: int-1',
      );
    });

    it('should log when fetchAndUpdateIntegration fails', async () => {
      const error = new Error('boom');
      vi.spyOn(
        internals.internalApiClient,
        'fetchIntegration',
      ).mockRejectedValue(error);

      await internals.fetchAndUpdateIntegration('int-1');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch and update integration int-1:',
        expect.objectContaining({ message: error.message }),
      );
    });

    it('should return an empty list when fetching org workflows fails', async () => {
      const error = new Error('boom');
      vi.spyOn(
        internals.internalApiClient,
        'fetchOrgWorkflows',
      ).mockRejectedValue(error);

      const workflows = await internals.fetchOrgWorkflows('org-1');

      expect(workflows).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch workflows:',
        expect.objectContaining({ message: error.message }),
      );
    });
  });

  describe('createBotInstance access warnings', () => {
    it('should warn when the bot is open to all users', async () => {
      mockClient.login.mockResolvedValue('token');

      await service.createBotInstance({
        ...mockIntegration,
        config: { allowedUserIds: [], isOpenToAllUsers: true },
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('open to all users'),
      );
    });

    it('should not warn for allowlisted bots', async () => {
      mockClient.login.mockResolvedValue('token');

      await service.createBotInstance(mockIntegration);

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });
});
