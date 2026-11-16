import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import type { TelegramGroupLinkService } from '@api/services/integrations/telegram/services/telegram-group-link.service';
import { TelegramBotService } from '@api/services/telegram-bot/telegram-bot.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

type Handler = (ctx: unknown, next?: () => Promise<void>) => unknown;

// Every bot the service creates, with what it wired and whether it runs.
const telegram = vi.hoisted(() => ({
  bots: [] as Array<{
    commandHandlers: Array<{ handler: Handler; names: unknown }>;
    commands: unknown[];
    filters: Map<string, Handler>;
    isRunning: boolean;
    middlewares: Handler[];
    token: string;
  }>,
}));

vi.mock('grammy', () => {
  class FakeBot {
    readonly commandHandlers: Array<{ handler: Handler; names: unknown }> = [];
    readonly commands: unknown[] = [];
    readonly filters = new Map<string, Handler>();
    isRunning = false;
    readonly middlewares: Handler[] = [];

    constructor(readonly token: string) {
      telegram.bots.push(this);
    }

    command(names: unknown, handler: Handler) {
      this.commands.push(names);
      this.commandHandlers.push({ handler, names });
    }

    on(filter: string, handler: Handler) {
      this.filters.set(filter, handler);
    }

    use(middleware: Handler) {
      this.middlewares.push(middleware);
    }

    start() {
      this.isRunning = true;
    }

    stop() {
      this.isRunning = false;
    }

    async handleUpdate() {}
  }

  class FakeInlineKeyboard {
    row() {
      return this;
    }
    text() {
      return this;
    }
  }

  return {
    Bot: FakeBot,
    InlineKeyboard: FakeInlineKeyboard,
    InputFile: class {},
  };
});

describe('TelegramBotService', () => {
  let config: Record<string, string>;
  let isDevPollingEnabled: boolean;
  let registeredWorkflows: unknown[];
  let logs: string[];
  let service: TelegramBotService;
  let linked: Array<{ chat: unknown; code: string }>;
  let linkedBrandLabel: string | null;

  beforeEach(() => {
    telegram.bots.length = 0;
    config = {
      TELEGRAM_ALLOWED_USER_IDS: '123,456',
      TELEGRAM_BOT_MODE: 'polling',
      TELEGRAM_BOT_TOKEN: 'test-token-123',
    };
    isDevPollingEnabled = true;
    registeredWorkflows = [];
    logs = [];
    linked = [];
    linkedBrandLabel = 'Acme';

    const record = (message: string) => {
      logs.push(message);
    };
    service = new TelegramBotService(
      {
        get: (key: string) => config[key],
        get isDevTelegramPollingEnabled() {
          return isDevPollingEnabled;
        },
      } as unknown as ConfigService,
      { error: record, log: record, warn: record } as unknown as LoggerService,
      {
        registerWorkflow: (definition: unknown) => {
          registeredWorkflows.push(definition);
        },
        runWorkflow: async () => undefined,
      } as unknown as SystemWorkflowRunnerService,
      { brand: { findFirst: async () => null } } as unknown as PrismaService,
      undefined,
      undefined,
      {
        isLinkCode: (value: string) => /^[A-Za-z0-9_-]{8,}$/.test(value),
        linkChat: async (code: string, chat: unknown) => {
          linked.push({ chat, code });
          return linkedBrandLabel === null
            ? null
            : { brandLabel: linkedBrandLabel };
        },
      } as unknown as TelegramGroupLinkService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('reports an idle bot before initialization', () => {
    expect(service.getStatus()).toEqual({
      activeConversations: 0,
      allowedUsers: 0,
      connectedChats: 0,
      engineReady: false,
      hasDefaultContext: false,
      running: false,
      workflowsLoaded: 0,
    });
    expect(service.getWorkflows().size).toBe(0);
  });

  it('stays disabled without a bot token', async () => {
    config = {};

    await service.onModuleInit();

    expect(telegram.bots).toEqual([]);
    expect(service.getStatus().running).toBe(false);
    expect(logs).toEqual([
      expect.stringContaining('TELEGRAM_BOT_TOKEN not set'),
    ]);
  });

  it('skips heavy initialization when local dev polling is disabled', async () => {
    isDevPollingEnabled = false;

    await service.onModuleInit();

    expect(telegram.bots).toEqual([]);
    expect(registeredWorkflows).toEqual([]);
    expect(service.getStatus().workflowsLoaded).toBe(0);
  });

  it('starts polling with the loaded workflows and media input handlers', async () => {
    await service.onModuleInit();

    const status = service.getStatus();
    expect(status).toMatchObject({
      allowedUsers: 2,
      engineReady: true,
      running: true,
    });
    expect(registeredWorkflows).toHaveLength(status.workflowsLoaded);
    expect(telegram.bots).toHaveLength(1);
    expect(telegram.bots[0]?.token).toBe('test-token-123');
    expect([...(telegram.bots[0]?.filters.keys() ?? [])]).toEqual(
      expect.arrayContaining([
        'message:audio',
        'message:voice',
        'message:video',
        'message:document',
      ]),
    );
  });

  async function sendFrom(userId: number, chatType = 'private') {
    const replies: string[] = [];
    let isNextReached = false;
    await telegram.bots[0]?.middlewares[0]?.(
      {
        chat: { type: chatType },
        from: { id: userId },
        reply: async (text: string) => {
          replies.push(text);
        },
      },
      async () => {
        isNextReached = true;
      },
    );
    return { isNextReached, replies };
  }

  it('passes an allowlisted user on to the command handlers', async () => {
    await service.onModuleInit();

    await expect(sendFrom(123)).resolves.toEqual({
      isNextReached: true,
      replies: [],
    });
  });

  it('refuses a user who is not on the allowlist', async () => {
    await service.onModuleInit();

    await expect(sendFrom(999)).resolves.toEqual({
      isNextReached: false,
      replies: ['⛔ You are not authorized to use this bot.'],
    });
  });

  it('stays silent when a stranger writes in a group the bot was added to', async () => {
    await service.onModuleInit();

    await expect(sendFrom(999, 'supergroup')).resolves.toEqual({
      isNextReached: false,
      replies: [],
    });
  });

  async function startInGroup(
    payload: string,
    chatType = 'supergroup',
    senderStatus: string | Error = 'administrator',
  ) {
    const replies: string[] = [];
    let isNextReached = false;
    const start = telegram.bots[0]?.commandHandlers[0];
    await start?.handler(
      {
        api: {
          getChatMember: async () => {
            if (senderStatus instanceof Error) {
              throw senderStatus;
            }
            return { status: senderStatus };
          },
        },
        chat: { id: -1001, title: 'Acme Team', type: chatType },
        from: { id: 777 },
        match: payload,
        reply: async (text: string) => {
          replies.push(text);
        },
      },
      async () => {
        isNextReached = true;
      },
    );
    return { isNextReached, replies, start };
  }

  it('connects a group that starts the bot with a link code, before the allowlist', async () => {
    await service.onModuleInit();

    const { isNextReached, replies, start } = await startInGroup('code-12345');

    expect(start?.names).toBe('start');
    expect(telegram.bots[0]?.commandHandlers).toHaveLength(
      telegram.bots[0]?.commands.length ?? 0,
    );
    expect(isNextReached).toBe(false);
    expect(replies).toEqual([
      'Connected. Posts for Acme can now go to this group.',
    ]);
    expect(linked).toEqual([
      {
        chat: { id: -1001, title: 'Acme Team', username: undefined },
        code: 'code-12345',
      },
    ]);
  });

  it('leaves the code unspent when a plain member tries to connect the group', async () => {
    await service.onModuleInit();

    const { replies } = await startInGroup(
      'code-12345',
      'supergroup',
      'member',
    );

    expect(replies).toEqual([
      'Only a group admin can connect this group to Genfeed.',
    ]);
    expect(linked).toEqual([]);
  });

  it('stays silent about a group /start that carries no link code', async () => {
    await service.onModuleInit();

    const { isNextReached, replies } = await startInGroup('hi!', 'supergroup');

    expect(replies).toEqual([]);
    expect(isNextReached).toBe(true);
    expect(linked).toEqual([]);
  });

  it('asks for admin rights when Telegram will not say who the sender is', async () => {
    await service.onModuleInit();

    const { replies } = await startInGroup(
      'code-12345',
      'supergroup',
      new Error('Forbidden'),
    );

    expect(replies).toEqual([
      'Genfeed cannot check who you are in this group. Make Genfeed an admin of the group, then connect it again from Genfeed.',
    ]);
    expect(linked).toEqual([]);
  });

  it('tells the group when the code is spent or expired', async () => {
    linkedBrandLabel = null;
    await service.onModuleInit();

    const { replies } = await startInGroup('old-code');

    expect(replies).toEqual([
      'This link has expired or was already used. Start again from Genfeed to connect this group.',
    ]);
  });

  it('leaves /start without a code, or in a private chat, to the operator flow', async () => {
    await service.onModuleInit();

    expect((await startInGroup('')).isNextReached).toBe(true);
    expect((await startInGroup('code-12345', 'private')).isNextReached).toBe(
      true,
    );
    expect(linked).toEqual([]);
  });

  it('refuses everyone when the allowlist names nobody', async () => {
    config = { ...config, TELEGRAM_ALLOWED_USER_IDS: '' };

    await service.onModuleInit();

    expect(service.getStatus().allowedUsers).toBe(0);
    await expect(sendFrom(123)).resolves.toMatchObject({
      isNextReached: false,
    });
    expect(logs).toContainEqual(
      expect.stringContaining(
        'names no user, so every command will be refused',
      ),
    );
  });

  it('stops the polling bot on module destroy', async () => {
    await service.onModuleInit();

    service.onModuleDestroy();

    expect(telegram.bots[0]?.isRunning).toBe(false);
    expect(service.getStatus().running).toBe(false);
  });

  it('rejects a webhook update before the bot exists', async () => {
    await expect(service.handleWebhookUpdate({})).rejects.toThrow(
      'Bot not initialized',
    );
  });
});
