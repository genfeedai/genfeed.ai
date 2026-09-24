import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveReview } = vi.hoisted(() => ({ resolveReview: vi.fn() }));

vi.mock('grammy', () => {
  const mockBot = {
    catch: vi.fn(),
    command: vi.fn(),
    on: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    use: vi.fn(),
  };
  return {
    Bot: vi.fn(function mockBotCtor() {
      return mockBot;
    }),
    InlineKeyboard: vi
      .fn()
      .mockImplementation(function mockInlineKeyboardCtor() {
        return {
          row: vi.fn().mockReturnThis(),
          text: vi.fn().mockReturnThis(),
        };
      }),
  };
});

vi.mock('rxjs', () => ({
  firstValueFrom: vi.fn(),
}));

// Overlay, not replace. A bare factory swaps out the *whole* module, so any
// export this spec's import graph reaches transitively disappears. Telegram's
// `ConfigService` now composes schemas from `@genfeedai/config`, whose barrel
// re-exports `schemas/stripe.schema.ts` → `@genfeedai/pricing` →
// `tier-entitlements`, which reads `SubscriptionTier` from here. Spreading the
// real module keeps every other export intact while still pinning `ParseMode`.
vi.mock('@genfeedai/contracts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/contracts')>()),
  ParseMode: { MARKDOWN: 'Markdown' },
}));

vi.mock('@genfeedai/integrations', () => ({
  BaseBotManager: class {
    protected readonly logger: unknown;
    protected readonly bots = new Map();
    constructor(logger: unknown) {
      this.logger = logger;
    }
    protected sanitizeErrorForLog(error: unknown) {
      return {
        message: error instanceof Error ? error.message : String(error),
      };
    }
    getActiveCount() {
      return this.bots.size;
    }
    async addIntegration(integration: Record<string, unknown>) {
      const instance = await (
        this as Record<string, unknown> & {
          createBotInstance: (i: Record<string, unknown>) => Promise<unknown>;
        }
      ).createBotInstance(integration);
      this.bots.set(integration.id, instance);
    }
    async updateIntegration(integration: Record<string, unknown>) {
      await this.addIntegration(integration);
    }
    async removeIntegration(id: string) {
      const bot = this.bots.get(id);
      if (bot) {
        await (
          this as Record<string, unknown> & {
            destroyBotInstance: (b: unknown) => Promise<void>;
          }
        ).destroyBotInstance(bot);
        this.bots.delete(id);
      }
    }
    async handleRedisEvent() {}
  },
  BotInternalApiClient: class {
    resolveAgentReportReview = resolveReview;
    fetchActiveIntegrations = vi.fn().mockResolvedValue([]);
    fetchIntegration = vi.fn().mockResolvedValue(null);
    fetchOrgWorkflows = vi.fn().mockResolvedValue([]);
    fetchWorkflow = vi.fn().mockResolvedValue(null);
  },
  IMAGE_MODELS: ['flux-pro', 'sdxl'],
  REDIS_EVENTS: {
    INTEGRATION_CREATED: 'integration:created',
    INTEGRATION_DELETED: 'integration:deleted',
    INTEGRATION_UPDATED: 'integration:updated',
  },
  VIDEO_MODELS: ['kling', 'runway'],
  WorkflowDefinition: {},
  extractWorkflowExecutionSnapshot: vi.fn(),
  extractWorkflowInputs: vi.fn().mockReturnValue([]),
  extractWorkflowOutputsFromExecution: vi.fn().mockReturnValue([]),
  isBotOpenToAllUsers: vi.fn(
    (config: { allowedUserIds?: string[]; isOpenToAllUsers?: boolean }) =>
      (config.allowedUserIds?.length ?? 0) === 0 &&
      config.isOpenToAllUsers === true,
  ),
  isBotUserAuthorized: vi.fn(
    (
      config: {
        allowedUserIds?: string[];
        isOpenToAllUsers?: boolean;
      },
      userId?: string | null,
    ) => {
      const normalizedUserId = userId?.trim();
      if (!normalizedUserId) return false;
      const allowedUserIds = config.allowedUserIds ?? [];
      return allowedUserIds.length > 0
        ? allowedUserIds.includes(normalizedUserId)
        : config.isOpenToAllUsers === true;
    },
  ),
  isWorkflowExecutionTerminalStatus: vi.fn().mockReturnValue(false),
}));

import { firstValueFrom } from 'rxjs';
import { TelegramBotManager } from './telegram-bot-manager.service';

const mockConfigService = {
  API_KEY: 'test-key',
  API_URL: 'http://localhost:3010',
};

const mockHttpService = {
  get: vi.fn(),
  post: vi.fn(),
};

const mockRedisService = {
  subscribe: vi.fn().mockResolvedValue(undefined),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
};

const mockLoggerService = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

function createManager(): TelegramBotManager {
  return new (
    TelegramBotManager as unknown as new (
      ...args: unknown[]
    ) => TelegramBotManager
  )(mockConfigService, mockHttpService, mockRedisService, mockLoggerService);
}

const mockIntegration = {
  botToken: 'test-token',
  config: { allowedUserIds: [] },
  createdAt: new Date(),
  id: 'int-1',
  orgId: 'org-1',
  platform: 'TELEGRAM' as const,
  status: 'ACTIVE' as const,
  updatedAt: new Date(),
};

describe('TelegramBotManager', () => {
  let manager: TelegramBotManager;

  beforeEach(() => {
    vi.clearAllMocks();
    (firstValueFrom as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
    });
    manager = createManager();
  });

  it('should be defined', () => {
    expect(manager).toBeDefined();
  });

  it('should initialize and subscribe to redis events', async () => {
    await manager.initialize();
    expect(mockRedisService.subscribe).toHaveBeenCalled();
  });

  it('should return 0 active bots initially', () => {
    expect(manager.getActiveCount()).toBe(0);
  });

  it('should create a bot instance with grammy Bot', async () => {
    const instance = await manager.createBotInstance(mockIntegration as never);
    expect(instance).toHaveProperty('bot');
    expect(instance).toHaveProperty('id', 'int-1');
    expect(instance).toHaveProperty('orgId', 'org-1');
  });

  it('should destroy bot instance without throwing', async () => {
    const instance = await manager.createBotInstance(mockIntegration as never);
    await expect(
      manager.destroyBotInstance(instance as never),
    ).resolves.not.toThrow();
  });

  it('should shutdown and clear bots', async () => {
    await manager.shutdown();
    expect(manager.getActiveCount()).toBe(0);
  });

  it('should handle empty integrations from API', async () => {
    (firstValueFrom as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
    });
    await manager.initialize();
    expect(manager.getActiveCount()).toBe(0);
  });

  it('should handle API failure during fetchActiveIntegrations', async () => {
    (firstValueFrom as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('network error'),
    );
    await manager.initialize();
    expect(manager.getActiveCount()).toBe(0);
  });

  it('should NOT unsubscribe shared Redis channels on shutdown (starves other bots)', async () => {
    // Shared integration channels are intentionally not unsubscribed because
    // RedisService has no per-handler granularity — unsubscribing would starve
    // Discord and Slack managers.  Cleanup happens in RedisService.onModuleDestroy.
    await manager.initialize();
    await manager.shutdown();
    expect(mockRedisService.unsubscribe).not.toHaveBeenCalled();
  });
});

describe('Telegram agent report reviews', () => {
  const token = 'a'.repeat(32);
  function context(data: string) {
    return {
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      callbackQuery: { data },
      chat: { id: -777 },
      from: { id: 42 },
      organizationId: 'untrusted-org',
      userId: 'untrusted-canonical-user',
      reply: vi.fn().mockResolvedValue(undefined),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resolveReview
      .mockReset()
      .mockResolvedValue({ success: true, message: 'Review recorded' });
  });

  async function handlers() {
    const instance = await createManager().createBotInstance({
      ...mockIntegration,
      config: { allowedUserIds: ['42'] },
    });
    const callback = vi
      .mocked(instance.bot.on)
      .mock.calls.find(([event]) => event === 'callback_query:data')?.[1] as (
      ctx: unknown,
    ) => Promise<void>;
    const authorize = vi.mocked(instance.bot.use).mock.calls[0][0] as (
      ctx: unknown,
      next: () => Promise<void>,
    ) => Promise<void>;
    return { callback, authorize };
  }

  it.each(['approve', 'reject'])(
    'binds %s to bot organization and actual Telegram actor/chat',
    async (decision) => {
      const { callback, authorize } = await handlers();
      const ctx = context(`agent-review:${token}:${decision}`);
      await authorize(ctx, () => callback(ctx));
      expect(ctx.answerCallbackQuery).toHaveBeenCalledOnce();
      expect(resolveReview).toHaveBeenCalledWith({
        organizationId: 'org-1',
        remoteUserId: '42',
        channelId: '-777',
        token,
        decision,
      });
      expect(ctx.reply).toHaveBeenCalledWith('Review recorded');
    },
  );

  it('keeps the bot allowlist guard in front of review resolution', async () => {
    const { callback, authorize } = await handlers();
    const ctx = {
      ...context(`agent-review:${token}:approve`),
      from: { id: 99 },
    };
    await authorize(ctx, () => callback(ctx));
    expect(resolveReview).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      'You are not authorized to use this bot.',
    );
  });

  it('does not resolve callbacks without an authenticated actor', async () => {
    const { callback } = await handlers();
    const ctx = {
      ...context(`agent-review:${token}:approve`),
      from: undefined,
    };
    await callback(ctx);
    expect(resolveReview).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledOnce();
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('may have expired'),
    );
  });

  it('returns a generic error and acknowledges only once when review resolution fails', async () => {
    resolveReview.mockRejectedValue(
      new Error('secret-token/internal-membership-detail'),
    );
    const { callback } = await handlers();
    const ctx = context(`agent-review:${token}:reject`);
    await callback(ctx);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledOnce();
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('may have expired'),
    );
    expect(JSON.stringify(ctx.reply.mock.calls)).not.toContain('secret-token');
  });

  it.each([
    `agent-review:${token}:publish`,
    'agent-review:invalid:approve',
    `agent-review:${token}:approve:org-spoof`,
    `agent-review:${token}:approve\n`,
  ])('ignores malformed review callback %s', async (data) => {
    const { callback } = await handlers();
    const ctx = context(data);
    await callback(ctx);
    expect(resolveReview).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('preserves workflow cancellation callbacks', async () => {
    const { callback } = await handlers();
    const ctx = context('confirm:cancel');
    await callback(ctx);
    expect(resolveReview).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      'Cancelled. Use /workflows to start again.',
    );
  });
});
