import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { TelegramBotService } from '@api/services/telegram-bot/telegram-bot.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

type Handler = (ctx: unknown, next?: () => Promise<void>) => unknown;

// Every bot the service creates, with what it wired and whether it runs.
const telegram = vi.hoisted(() => ({
  bots: [] as Array<{
    commands: unknown[];
    filters: Map<string, Handler>;
    isRunning: boolean;
    middlewares: Handler[];
    token: string;
  }>,
}));

vi.mock('grammy', () => {
  class FakeBot {
    readonly commands: unknown[] = [];
    readonly filters = new Map<string, Handler>();
    isRunning = false;
    readonly middlewares: Handler[] = [];

    constructor(readonly token: string) {
      telegram.bots.push(this);
    }

    command(names: unknown) {
      this.commands.push(names);
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

  async function sendFrom(userId: number) {
    const replies: string[] = [];
    let isNextReached = false;
    await telegram.bots[0]?.middlewares[0]?.(
      {
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
