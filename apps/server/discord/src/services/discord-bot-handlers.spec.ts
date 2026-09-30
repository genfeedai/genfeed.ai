import { registerDiscordBotHandlers } from '@discord/services/discord-bot-handlers';
import type { OrgIntegration, WorkflowSession } from '@genfeedai/integrations';
import type { Client, Message } from 'discord.js';

type ListenerFn = (...args: unknown[]) => Promise<void> | void;

interface HandlerMocks {
  getSession: ReturnType<typeof vi.fn>;
  handleAttachmentInput: ReturnType<typeof vi.fn>;
  handleButtonInteraction: ReturnType<typeof vi.fn>;
  handleCancelCommand: ReturnType<typeof vi.fn>;
  handleSettingsCommand: ReturnType<typeof vi.fn>;
  handleStatusCommand: ReturnType<typeof vi.fn>;
  handleTextInput: ReturnType<typeof vi.fn>;
  handleWorkflowsCommand: ReturnType<typeof vi.fn>;
  logReady: ReturnType<typeof vi.fn>;
  registerSlashCommands: ReturnType<typeof vi.fn>;
}

interface HandlerTestContext {
  listeners: Map<string, ListenerFn>;
  mocks: HandlerMocks;
  onceListeners: Map<string, ListenerFn>;
}

const integration: OrgIntegration = {
  botToken: 'bot-token',
  config: { allowedUserIds: ['user-1'] },
  createdAt: new Date('2026-01-01'),
  id: 'int-1',
  orgId: 'org-1',
  platform: 'DISCORD',
  status: 'ACTIVE',
  updatedAt: new Date('2026-01-01'),
};

function createContext(): HandlerTestContext {
  const listeners = new Map<string, ListenerFn>();
  const onceListeners = new Map<string, ListenerFn>();
  const client = {
    on: vi.fn().mockImplementation((event: string, listener: ListenerFn) => {
      listeners.set(event, listener);
    }),
    once: vi.fn().mockImplementation((event: string, listener: ListenerFn) => {
      onceListeners.set(event, listener);
    }),
  } as unknown as Client;

  const mocks: HandlerMocks = {
    getSession: vi.fn(),
    handleAttachmentInput: vi.fn().mockResolvedValue(undefined),
    handleButtonInteraction: vi.fn().mockResolvedValue(undefined),
    handleCancelCommand: vi.fn().mockResolvedValue(undefined),
    handleSettingsCommand: vi.fn().mockResolvedValue(undefined),
    handleStatusCommand: vi.fn().mockResolvedValue(undefined),
    handleTextInput: vi.fn().mockResolvedValue(undefined),
    handleWorkflowsCommand: vi.fn().mockResolvedValue(undefined),
    logReady: vi.fn(),
    registerSlashCommands: vi.fn().mockResolvedValue(undefined),
  };

  registerDiscordBotHandlers(
    client,
    integration,
    mocks as unknown as Parameters<typeof registerDiscordBotHandlers>[2],
  );

  return { listeners, mocks, onceListeners };
}

function createCommandInteraction(commandName: string, userId = 'user-1') {
  return {
    commandName,
    isButton: vi.fn().mockReturnValue(false),
    isChatInputCommand: vi.fn().mockReturnValue(true),
    isRepliable: vi.fn().mockReturnValue(true),
    reply: vi.fn().mockResolvedValue(undefined),
    user: { id: userId },
  };
}

function createMessage(overrides: {
  attachments?: Map<string, unknown>;
  bot?: boolean;
  content?: string;
  userId?: string;
}): Message {
  return {
    attachments: overrides.attachments ?? new Map<string, unknown>(),
    author: { bot: overrides.bot ?? false, id: overrides.userId ?? 'user-1' },
    channelId: 'ch-1',
    content: overrides.content ?? '',
  } as unknown as Message;
}

const collectingSession: WorkflowSession = {
  collectedInputs: new Map(),
  currentInputIndex: 0,
  requiredInputs: [],
  startedAt: Date.now(),
  state: 'collecting',
};

describe('registerDiscordBotHandlers', () => {
  describe('ready event', () => {
    it('should log the tag and register slash commands', async () => {
      const ctx = createContext();

      const [readyListener] = [...ctx.onceListeners.values()];
      await readyListener?.({ user: { id: 'bot-user', tag: 'Bot#0001' } });

      expect(ctx.mocks.logReady).toHaveBeenCalledWith('Bot#0001');
      expect(ctx.mocks.registerSlashCommands).toHaveBeenCalledWith(
        'bot-user',
        'bot-token',
      );
    });
  });

  describe('interactionCreate', () => {
    it('should reply with an authorization error for unauthorized users', async () => {
      const ctx = createContext();
      const interaction = createCommandInteraction('workflows', 'intruder');

      await ctx.listeners.get('interactionCreate')?.(interaction);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'You are not authorized to use this bot.',
        ephemeral: true,
      });
      expect(ctx.mocks.handleWorkflowsCommand).not.toHaveBeenCalled();
    });

    it('should stay silent for unauthorized non-repliable interactions', async () => {
      const ctx = createContext();
      const interaction = createCommandInteraction('workflows', 'intruder');
      interaction.isRepliable.mockReturnValue(false);

      await ctx.listeners.get('interactionCreate')?.(interaction);

      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it.each([
      ['workflows', 'handleWorkflowsCommand'],
      ['status', 'handleStatusCommand'],
      ['cancel', 'handleCancelCommand'],
      ['settings', 'handleSettingsCommand'],
    ] as const)('should route /%s to %s', async (commandName, handlerName) => {
      const ctx = createContext();
      const interaction = createCommandInteraction(commandName);

      await ctx.listeners.get('interactionCreate')?.(interaction);

      expect(ctx.mocks[handlerName]).toHaveBeenCalled();
    });

    it('should ignore unknown slash commands', async () => {
      const ctx = createContext();
      const interaction = createCommandInteraction('unknown');

      await ctx.listeners.get('interactionCreate')?.(interaction);

      expect(ctx.mocks.handleWorkflowsCommand).not.toHaveBeenCalled();
      expect(ctx.mocks.handleStatusCommand).not.toHaveBeenCalled();
      expect(ctx.mocks.handleCancelCommand).not.toHaveBeenCalled();
      expect(ctx.mocks.handleSettingsCommand).not.toHaveBeenCalled();
    });

    it('should route button interactions with the org id', async () => {
      const ctx = createContext();
      const interaction = {
        customId: 'confirm:run',
        isButton: vi.fn().mockReturnValue(true),
        isChatInputCommand: vi.fn().mockReturnValue(false),
        isRepliable: vi.fn().mockReturnValue(true),
        user: { id: 'user-1' },
      };

      await ctx.listeners.get('interactionCreate')?.(interaction);

      expect(ctx.mocks.handleButtonInteraction).toHaveBeenCalledWith(
        interaction,
        'org-1',
      );
    });
  });

  describe('messageCreate', () => {
    it('should ignore bot-authored messages', async () => {
      const ctx = createContext();

      await ctx.listeners.get('messageCreate')?.(
        createMessage({ bot: true, content: 'hi' }),
      );

      expect(ctx.mocks.getSession).not.toHaveBeenCalled();
    });

    it('should ignore unauthorized authors', async () => {
      const ctx = createContext();

      await ctx.listeners.get('messageCreate')?.(
        createMessage({ content: 'hi', userId: 'intruder' }),
      );

      expect(ctx.mocks.getSession).not.toHaveBeenCalled();
    });

    it('should ignore messages without a collecting session', async () => {
      const ctx = createContext();
      ctx.mocks.getSession.mockReturnValue(undefined);

      await ctx.listeners.get('messageCreate')?.(
        createMessage({ content: 'hi' }),
      );

      expect(ctx.mocks.getSession).toHaveBeenCalledWith('ch-1:user-1');
      expect(ctx.mocks.handleTextInput).not.toHaveBeenCalled();
      expect(ctx.mocks.handleAttachmentInput).not.toHaveBeenCalled();
    });

    it('should route attachment messages to handleAttachmentInput', async () => {
      const ctx = createContext();
      ctx.mocks.getSession.mockReturnValue(collectingSession);
      const message = createMessage({
        attachments: new Map([['a-1', { url: 'https://cdn/img.png' }]]),
      });

      await ctx.listeners.get('messageCreate')?.(message);

      expect(ctx.mocks.handleAttachmentInput).toHaveBeenCalledWith(
        message,
        'ch-1:user-1',
      );
      expect(ctx.mocks.handleTextInput).not.toHaveBeenCalled();
    });

    it('should route text messages to handleTextInput', async () => {
      const ctx = createContext();
      ctx.mocks.getSession.mockReturnValue(collectingSession);
      const message = createMessage({ content: 'a red panda' });

      await ctx.listeners.get('messageCreate')?.(message);

      expect(ctx.mocks.handleTextInput).toHaveBeenCalledWith(
        message,
        'ch-1:user-1',
      );
      expect(ctx.mocks.handleAttachmentInput).not.toHaveBeenCalled();
    });

    it('should ignore empty non-attachment messages', async () => {
      const ctx = createContext();
      ctx.mocks.getSession.mockReturnValue(collectingSession);

      await ctx.listeners.get('messageCreate')?.(createMessage({}));

      expect(ctx.mocks.handleTextInput).not.toHaveBeenCalled();
      expect(ctx.mocks.handleAttachmentInput).not.toHaveBeenCalled();
    });
  });
});
