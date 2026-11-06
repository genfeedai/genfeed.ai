import { registerDiscordBotHandlers } from '@discord/services/discord-bot-handlers';
import type { OrgIntegration, WorkflowSession } from '@genfeedai/integrations';
import type { Client, Message } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';

type Listener = (...args: unknown[]) => Promise<void> | void;

interface Reply {
  content: string;
  ephemeral: boolean;
}

interface Actor {
  user: { id: string };
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

const session = (state: WorkflowSession['state']): WorkflowSession => ({
  collectedInputs: new Map(),
  currentInputIndex: 0,
  requiredInputs: [],
  startedAt: Date.now(),
  state,
});

const message = (
  fields: {
    attachments?: Map<string, unknown>;
    bot?: boolean;
    content?: string;
    userId?: string;
  } = {},
) =>
  ({
    attachments: fields.attachments ?? new Map<string, unknown>(),
    author: { bot: fields.bot ?? false, id: fields.userId ?? 'user-1' },
    channelId: 'ch-1',
    content: fields.content ?? '',
  }) as unknown as Message;

describe('registerDiscordBotHandlers', () => {
  let listeners: Map<string, Listener>;
  let sessions: Map<string, WorkflowSession>;
  let handled: string[];
  let replies: Reply[];

  const emit = (event: string, payload: unknown) =>
    listeners.get(event)?.(payload);
  const command = (
    commandName: string,
    userId = 'user-1',
    isRepliable = true,
  ) => ({
    commandName,
    isButton: () => false,
    isChatInputCommand: () => true,
    isRepliable: () => isRepliable,
    reply: async (reply: Reply) => {
      replies.push(reply);
    },
    user: { id: userId },
  });

  beforeEach(() => {
    listeners = new Map();
    sessions = new Map();
    handled = [];
    replies = [];

    // A Discord client that keeps the listeners it is given.
    const client = {
      on: (event: string, listener: Listener) => listeners.set(event, listener),
      once: (event: string, listener: Listener) =>
        listeners.set(event, listener),
    } as unknown as Client;
    // The bot manager: each handler notes what it handled.
    const note =
      (name: string) =>
      async (subject: Actor | Message, extra = '') => {
        const who = 'user' in subject ? subject.user.id : subject.author.id;
        handled.push(`${name} ${who} ${extra}`.trim());
      };
    registerDiscordBotHandlers(client, integration, {
      getSession: (key: string) => sessions.get(key),
      handleAttachmentInput: note('attachment'),
      handleButtonInteraction: note('button'),
      handleCancelCommand: note('cancel'),
      handleSettingsCommand: note('settings'),
      handleStatusCommand: note('status'),
      handleTextInput: note('text'),
      handleWorkflowsCommand: note('workflows'),
      logReady: (tag: string) => handled.push(`ready ${tag}`),
      registerSlashCommands: async (clientId: string, token: string) => {
        handled.push(`commands ${clientId} ${token}`);
      },
    } as unknown as Parameters<typeof registerDiscordBotHandlers>[2]);
  });

  it('logs the tag and registers slash commands once ready', async () => {
    await emit('clientReady', { user: { id: 'bot-user', tag: 'Bot#0001' } });

    expect(handled).toEqual(['ready Bot#0001', 'commands bot-user bot-token']);
  });

  describe('interactions', () => {
    it('tells an unauthorized user they may not use the bot', async () => {
      await emit('interactionCreate', command('workflows', 'intruder'));

      expect(replies).toEqual([
        { content: 'You are not authorized to use this bot.', ephemeral: true },
      ]);
      expect(handled).toEqual([]);
    });

    it('stays silent for an unauthorized interaction it cannot answer', async () => {
      await emit('interactionCreate', command('workflows', 'intruder', false));

      expect(replies).toEqual([]);
      expect(handled).toEqual([]);
    });

    it.each([
      ['workflows', ['workflows user-1 org-1']],
      ['status', ['status user-1']],
      ['cancel', ['cancel user-1']],
      ['settings', ['settings user-1']],
      ['unknown', []],
    ])('routes /%s', async (commandName, expected) => {
      await emit('interactionCreate', command(commandName));

      expect(handled).toEqual(expected);
    });

    it('routes a button press with the organization', async () => {
      await emit('interactionCreate', {
        customId: 'confirm:run',
        isButton: () => true,
        isChatInputCommand: () => false,
        isRepliable: () => true,
        user: { id: 'user-1' },
      });

      expect(handled).toEqual(['button user-1 org-1']);
    });
  });

  describe('messages', () => {
    beforeEach(() => {
      sessions.set('ch-1:user-1', session('collecting'));
    });

    it.each([
      [
        'text',
        message({ content: 'a red panda' }),
        ['text user-1 ch-1:user-1'],
      ],
      [
        'an attachment',
        message({
          attachments: new Map([['a-1', { url: 'https://cdn/img.png' }]]),
          content: 'caption',
        }),
        ['attachment user-1 ch-1:user-1'],
      ],
      ['an empty message', message(), []],
      ['a bot message', message({ bot: true, content: 'hi' }), []],
      [
        'an unauthorized author',
        message({ content: 'hi', userId: 'intruder' }),
        [],
      ],
    ])(
      'collects %s for the channel session',
      async (_case, input, expected) => {
        await emit('messageCreate', input);

        expect(handled).toEqual(expected);
      },
    );

    it.each([
      ['no session', []],
      [
        'a session that is not collecting',
        [['ch-1:user-1', session('running')]],
      ],
      [
        'a session in another channel',
        [['ch-2:user-1', session('collecting')]],
      ],
    ] as const)('ignores a message with %s', async (_case, entries) => {
      sessions = new Map(entries);

      await emit('messageCreate', message({ content: 'hi' }));

      expect(handled).toEqual([]);
    });
  });
});
