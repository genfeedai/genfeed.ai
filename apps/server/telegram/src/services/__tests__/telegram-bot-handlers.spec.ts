import {
  IMAGE_MODELS,
  type OrgIntegration,
  REDIS_EVENTS,
  VIDEO_MODELS,
  type WorkflowInput,
  type WorkflowSession,
} from '@genfeedai/integrations';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@telegram/config/config.service';
import { TelegramBotManager } from '@telegram/services/telegram-bot-manager.service';
import type { Context } from 'grammy';
import { of, throwError } from 'rxjs';
import type { Mock } from 'vitest';

const { mockBot } = vi.hoisted(() => ({
  mockBot: {
    api: {
      getFile: vi.fn(),
      token: 'test-token',
    },
    catch: vi.fn(),
    command: vi.fn(),
    on: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    use: vi.fn(),
  },
}));

vi.mock('grammy', () => ({
  Bot: vi.fn(function mockBotCtor() {
    return mockBot;
  }),
  InlineKeyboard: vi.fn(function mockInlineKeyboardCtor() {
    return {
      row: vi.fn().mockReturnThis(),
      text: vi.fn().mockReturnThis(),
    };
  }),
}));

type CommandHandler = (ctx: Context) => Promise<void>;
type MiddlewareHandler = (
  ctx: Context,
  next: () => Promise<void>,
) => Promise<void>;
type ErrorHandler = (error: unknown) => void;

interface FakeCtx {
  answerCallbackQuery: Mock;
  api: { getFile: Mock; token: string };
  callbackQuery?: { data?: string };
  chat?: { id: number };
  from?: { id: number };
  message?: {
    text?: string;
    photo?: Array<{ file_id: string; height: number; width: number }>;
  };
  reply: Mock;
  replyWithPhoto: Mock;
  replyWithVideo: Mock;
}

interface HttpServiceMock {
  get: Mock;
  patch: Mock;
  post: Mock;
}

interface LoggerAccess {
  logger: {
    debug: Mock;
    error: Mock;
    log: Mock;
    warn: Mock;
  };
}

interface PollingAccess {
  workflowExecutionPollIntervalMs: number;
  workflowExecutionPollTimeoutMs: number;
}

interface MonitorAccess {
  monitorWorkflowExecution(
    orgId: string,
    chatId: string,
    ctx: Context,
  ): Promise<void>;
}

const API_URL = 'http://localhost:3010';
const CHAT_ID = '4242';

function createCtx(overrides: Partial<FakeCtx> = {}): FakeCtx {
  return {
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    api: { getFile: vi.fn(), token: 'test-token' },
    chat: { id: 4242 },
    from: { id: 123456 },
    reply: vi.fn().mockResolvedValue({ message_id: 1 }),
    replyWithPhoto: vi.fn().mockResolvedValue(undefined),
    replyWithVideo: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function asContext(ctx: FakeCtx): Context {
  return ctx as unknown as Context;
}

function makeIntegration(
  configOverrides: Partial<OrgIntegration['config']> = {},
): OrgIntegration {
  return {
    botToken: 'bot-token-123',
    config: {
      allowedUserIds: ['123456'],
      ...configOverrides,
    },
    createdAt: new Date('2026-01-01'),
    id: 'telegram-integration-1',
    orgId: 'org-123',
    platform: 'TELEGRAM',
    status: 'ACTIVE',
    updatedAt: new Date('2026-01-01'),
  };
}

function makeTextInput(overrides: Partial<WorkflowInput> = {}): WorkflowInput {
  return {
    defaultValue: undefined,
    inputType: 'text',
    label: 'Prompt',
    nodeId: 'promptNode',
    required: true,
    ...overrides,
  };
}

function makeSession(
  overrides: Partial<WorkflowSession> = {},
): WorkflowSession {
  return {
    collectedInputs: new Map<string, string>(),
    currentInputIndex: 0,
    orgId: 'org-123',
    requiredInputs: [],
    startedAt: Date.now(),
    state: 'collecting',
    ...overrides,
  };
}

function flush(ms = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `fetchAndAddIntegration` / `fetchAndUpdateIntegration` are `protected` — they
 * are the internals the Redis integration events delegate to. These two tests
 * drive them directly to reach the "payload cannot be normalized" branch, which
 * a well-formed Redis event cannot produce. Going through a structural view
 * (rather than a test subclass) keeps the DI-constructed instance under test.
 */
type IntegrationFetchInternals = {
  fetchAndAddIntegration(integrationId: string): Promise<void>;
  fetchAndUpdateIntegration(integrationId: string): Promise<void>;
};

function integrationInternals(
  instance: TelegramBotManager,
): IntegrationFetchInternals {
  return instance as unknown as IntegrationFetchInternals;
}

describe('TelegramBotManager handlers', () => {
  let service: TelegramBotManager;
  let httpMock: HttpServiceMock;
  let redisMock: { publish: Mock; subscribe: Mock; unsubscribe: Mock };
  let configMock: { API_KEY: string; API_URL: string; get: Mock };
  let logger: LoggerAccess['logger'];

  function getCommandHandler(name: string): CommandHandler {
    const call = mockBot.command.mock.calls.find(([cmd]) => cmd === name);
    if (!call) {
      throw new Error(`No handler registered for command ${name}`);
    }
    return call[1] as CommandHandler;
  }

  function getEventHandler(event: string): CommandHandler {
    const call = mockBot.on.mock.calls.find(([key]) => key === event);
    if (!call) {
      throw new Error(`No handler registered for event ${event}`);
    }
    return call[1] as CommandHandler;
  }

  function getAuthMiddleware(): MiddlewareHandler {
    const call = mockBot.use.mock.calls[0];
    if (!call) {
      throw new Error('No auth middleware registered');
    }
    return call[0] as MiddlewareHandler;
  }

  function getErrorHandler(): ErrorHandler {
    const call = mockBot.catch.mock.calls[0];
    if (!call) {
      throw new Error('No error handler registered');
    }
    return call[0] as ErrorHandler;
  }

  async function registerBot(
    integration: OrgIntegration = makeIntegration(),
  ): Promise<void> {
    mockBot.start.mockResolvedValue(undefined);
    mockBot.stop.mockResolvedValue(undefined);
    await service.createBotInstance(integration);
  }

  beforeEach(async () => {
    configMock = {
      API_KEY: 'test-key',
      API_URL,
      get: vi.fn(),
    };
    httpMock = {
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
    };
    redisMock = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramBotManager,
        { provide: LoggerService, useValue: logger },
        { provide: ConfigService, useValue: configMock },
        { provide: HttpService, useValue: httpMock },
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    service = module.get<TelegramBotManager>(TelegramBotManager);

    logger = (service as unknown as LoggerAccess).logger;
    vi.spyOn(logger, 'log').mockImplementation(() => undefined);
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockBot.start.mockReset();
    mockBot.stop.mockReset();
    mockBot.use.mockReset();
    mockBot.command.mockReset();
    mockBot.on.mockReset();
    mockBot.catch.mockReset();
    mockBot.api.getFile.mockReset();
  });

  describe('setup and auth middleware', () => {
    it('warns when an integration is open to all users', async () => {
      await registerBot(
        makeIntegration({ allowedUserIds: [], isOpenToAllUsers: true }),
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('open to all users'),
      );
    });

    it('does not warn for an allowlisted integration', async () => {
      await registerBot();

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('rejects an unauthorized user', async () => {
      await registerBot();
      const middleware = getAuthMiddleware();
      const ctx = createCtx({ from: { id: 999999 } });
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(asContext(ctx), next);

      expect(ctx.reply).toHaveBeenCalledWith(
        'You are not authorized to use this bot.',
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects a payload without a sender', async () => {
      await registerBot();
      const middleware = getAuthMiddleware();
      const ctx = createCtx({ from: undefined });
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(asContext(ctx), next);

      expect(ctx.reply).toHaveBeenCalledWith(
        'You are not authorized to use this bot.',
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('passes an allowlisted user through', async () => {
      await registerBot();
      const middleware = getAuthMiddleware();
      const ctx = createCtx();
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(asContext(ctx), next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('logs errors routed through bot.catch', async () => {
      await registerBot();
      const onError = getErrorHandler();

      onError(new Error('grammy blew up'));

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in bot telegram-integration-1'),
        expect.objectContaining({ message: 'grammy blew up' }),
      );
    });

    it('replies with the help text on /start', async () => {
      await registerBot();
      const ctx = createCtx();

      await getCommandHandler('start')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('GenFeed AI Bot'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });
  });

  describe('/workflows command', () => {
    it('ignores updates without a chat', async () => {
      await registerBot();
      const ctx = createCtx({ chat: undefined });

      await getCommandHandler('workflows')(asContext(ctx));

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('refuses to start while a workflow is running', async () => {
      await registerBot();
      service.setSession(CHAT_ID, makeSession({ state: 'running' }));
      const ctx = createCtx();

      await getCommandHandler('workflows')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        'A workflow is running. Use /status to check progress or /cancel to abort.',
      );
    });

    it('reports when the org has no workflows', async () => {
      await registerBot();
      httpMock.get.mockReturnValue(of({ data: [] }));
      const ctx = createCtx();

      await getCommandHandler('workflows')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        'No workflows available for your organization.',
      );
      expect(service.getSession(CHAT_ID)).toBeUndefined();
    });

    it('lists workflows and opens a selecting session', async () => {
      await registerBot();
      httpMock.get.mockReturnValue(
        of({ data: [{ id: 'wf-1', name: 'Image Gen' }] }),
      );
      const ctx = createCtx();

      await getCommandHandler('workflows')(asContext(ctx));

      expect(httpMock.get).toHaveBeenCalledWith(
        `${API_URL}/v1/orgs/org-123/workflows`,
        undefined,
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Select a workflow to run'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
      expect(service.getSession(CHAT_ID)?.state).toBe('selecting');
      expect(service.getSession(CHAT_ID)?.orgId).toBe('org-123');
    });

    it('replies with a fallback when listing workflows fails', async () => {
      await registerBot();
      vi.spyOn(service, 'fetchOrgWorkflows').mockRejectedValue(
        new Error('list failed'),
      );
      const ctx = createCtx();

      await getCommandHandler('workflows')(asContext(ctx));

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch workflows:',
        expect.objectContaining({ message: 'list failed' }),
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        'Failed to load workflows. Please try again.',
      );
    });
  });

  describe('/status command', () => {
    it('ignores updates without a chat', async () => {
      await registerBot();
      const ctx = createCtx({ chat: undefined });

      await getCommandHandler('status')(asContext(ctx));

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('reports idle when there is no session', async () => {
      await registerBot();
      const ctx = createCtx();

      await getCommandHandler('status')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Idle - no active workflow'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('reports the selecting state', async () => {
      await registerBot();
      service.setSession(CHAT_ID, makeSession({ state: 'selecting' }));
      const ctx = createCtx();

      await getCommandHandler('status')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Selecting a workflow'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('reports collecting progress', async () => {
      await registerBot();
      service.setSession(
        CHAT_ID,
        makeSession({
          currentInputIndex: 1,
          requiredInputs: [makeTextInput(), makeTextInput({ nodeId: 'n2' })],
          state: 'collecting',
        }),
      );
      const ctx = createCtx();

      await getCommandHandler('status')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Collecting inputs (1/2)'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('reports the confirming state', async () => {
      await registerBot();
      service.setSession(CHAT_ID, makeSession({ state: 'confirming' }));
      const ctx = createCtx();

      await getCommandHandler('status')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Waiting for confirmation'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('reports a running workflow without an execution id', async () => {
      await registerBot();
      service.setSession(
        CHAT_ID,
        makeSession({
          executionId: undefined,
          state: 'running',
          workflowName: 'Image Gen',
        }),
      );
      const ctx = createCtx();

      await getCommandHandler('status')(asContext(ctx));

      expect(httpMock.get).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Running *Image Gen*'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('includes the live execution status when available', async () => {
      await registerBot();
      service.setSession(
        CHAT_ID,
        makeSession({
          executionId: 'exec-1',
          state: 'running',
          workflowName: 'Image Gen',
        }),
      );
      httpMock.get.mockReturnValue(
        of({ data: { nodeResults: [], status: 'running' } }),
      );
      const ctx = createCtx();

      await getCommandHandler('status')(asContext(ctx));

      expect(httpMock.get).toHaveBeenCalledWith(
        `${API_URL}/v1/internal/orgs/org-123/workflow-executions/exec-1`,
        { headers: { Authorization: 'Bearer test-key' } },
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Running *Image Gen* (running)'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('falls back to the base line when the execution lookup fails', async () => {
      await registerBot();
      service.setSession(
        CHAT_ID,
        makeSession({
          executionId: 'exec-1',
          state: 'running',
          workflowName: 'Image Gen',
        }),
      );
      httpMock.get.mockReturnValue(throwError(() => new Error('api down')));
      const ctx = createCtx();

      await getCommandHandler('status')(asContext(ctx));

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to fetch workflow execution status',
        expect.objectContaining({ executionId: 'exec-1' }),
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Running *Image Gen*'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });
  });

  describe('/cancel command', () => {
    it('ignores updates without a chat', async () => {
      await registerBot();
      const ctx = createCtx({ chat: undefined });

      await getCommandHandler('cancel')(asContext(ctx));

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('reports when there is nothing to cancel', async () => {
      await registerBot();
      const ctx = createCtx();

      await getCommandHandler('cancel')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith('Nothing to cancel.');
    });

    it('treats an idle session as nothing to cancel', async () => {
      await registerBot();
      service.setSession(CHAT_ID, makeSession({ state: 'idle' }));
      const ctx = createCtx();

      await getCommandHandler('cancel')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith('Nothing to cancel.');
    });

    it('cancels the running execution and clears the session', async () => {
      await registerBot();
      service.setSession(
        CHAT_ID,
        makeSession({ executionId: 'exec-1', state: 'running' }),
      );
      httpMock.patch.mockReturnValue(of({ data: {} }));
      const ctx = createCtx();

      await getCommandHandler('cancel')(asContext(ctx));

      expect(httpMock.patch).toHaveBeenCalledWith(
        `${API_URL}/v1/internal/orgs/org-123/workflow-executions/exec-1`,
        { status: 'cancelled' },
        { headers: { Authorization: 'Bearer test-key' } },
      );
      expect(service.getSession(CHAT_ID)).toBeUndefined();
      expect(ctx.reply).toHaveBeenCalledWith(
        'Cancelled. Use /workflows to start again.',
      );
    });

    it('still clears the session when the cancel call fails', async () => {
      await registerBot();
      service.setSession(
        CHAT_ID,
        makeSession({ executionId: 'exec-1', state: 'running' }),
      );
      httpMock.patch.mockReturnValue(throwError(() => new Error('api down')));
      const ctx = createCtx();

      await getCommandHandler('cancel')(asContext(ctx));

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to cancel workflow execution',
        expect.objectContaining({ executionId: 'exec-1' }),
      );
      expect(service.getSession(CHAT_ID)).toBeUndefined();
      expect(ctx.reply).toHaveBeenCalledWith(
        'Cancelled. Use /workflows to start again.',
      );
    });
  });

  describe('/settings command', () => {
    it('ignores updates without a chat', async () => {
      await registerBot();
      const ctx = createCtx({ chat: undefined });

      await getCommandHandler('settings')(asContext(ctx));

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('refuses while a workflow is running', async () => {
      await registerBot();
      service.setSession(CHAT_ID, makeSession({ state: 'running' }));
      const ctx = createCtx();

      await getCommandHandler('settings')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        'A workflow is running. Use /status to check progress or /cancel to abort.',
      );
    });

    it('shows image and video model menus', async () => {
      await registerBot();
      const ctx = createCtx();

      await getCommandHandler('settings')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        '*Image Model:*',
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        '*Video Model:*',
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('marks the currently selected models after configuration', async () => {
      await registerBot();
      const callbackHandler = getEventHandler('callback_query:data');

      const configureCtx = createCtx({
        callbackQuery: { data: `cfg:img:${IMAGE_MODELS[1]}` },
      });
      await callbackHandler(asContext(configureCtx));

      const ctx = createCtx();
      await getCommandHandler('settings')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        '*Image Model:*',
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });
  });

  describe('callback queries', () => {
    it('ignores callbacks without data', async () => {
      await registerBot();
      const ctx = createCtx({ callbackQuery: {} });

      await getEventHandler('callback_query:data')(asContext(ctx));

      expect(ctx.answerCallbackQuery).not.toHaveBeenCalled();
    });

    it('ignores callbacks without a chat', async () => {
      await registerBot();
      const ctx = createCtx({
        callbackQuery: { data: 'confirm:run' },
        chat: undefined,
      });

      await getEventHandler('callback_query:data')(asContext(ctx));

      expect(ctx.answerCallbackQuery).not.toHaveBeenCalled();
    });

    it('cancels the flow via confirm:cancel', async () => {
      await registerBot();
      service.setSession(CHAT_ID, makeSession({ state: 'confirming' }));
      const ctx = createCtx({ callbackQuery: { data: 'confirm:cancel' } });

      await getEventHandler('callback_query:data')(asContext(ctx));

      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
      expect(service.getSession(CHAT_ID)).toBeUndefined();
      expect(ctx.reply).toHaveBeenCalledWith(
        'Cancelled. Use /workflows to start again.',
      );
    });

    it('stores the image model preference', async () => {
      await registerBot();
      const ctx = createCtx({
        callbackQuery: { data: `cfg:img:${IMAGE_MODELS[1]}` },
      });

      await getEventHandler('callback_query:data')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        `Image model set to: *${IMAGE_MODELS[1]}*`,
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('stores the video model preference on existing settings', async () => {
      await registerBot();
      const handler = getEventHandler('callback_query:data');

      await handler(
        asContext(
          createCtx({ callbackQuery: { data: `cfg:img:${IMAGE_MODELS[1]}` } }),
        ),
      );

      const ctx = createCtx({
        callbackQuery: { data: `cfg:vid:${VIDEO_MODELS[0]}` },
      });
      await handler(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        `Video model set to: *${VIDEO_MODELS[0]}*`,
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('restarts input collection via confirm:edit', async () => {
      await registerBot();
      service.setSession(
        CHAT_ID,
        makeSession({
          collectedInputs: new Map([['promptNode', 'old value']]),
          currentInputIndex: 1,
          requiredInputs: [makeTextInput()],
          state: 'confirming',
          workflowName: 'Image Gen',
        }),
      );
      const ctx = createCtx({ callbackQuery: { data: 'confirm:edit' } });

      await getEventHandler('callback_query:data')(asContext(ctx));

      const session = service.getSession(CHAT_ID);
      expect(session?.state).toBe('collecting');
      expect(session?.currentInputIndex).toBe(0);
      expect(session?.collectedInputs.size).toBe(0);
      expect(ctx.reply).toHaveBeenCalledWith(
        "Inputs cleared. Let's start over.",
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Input (1/1)'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('ignores confirm:edit without a session', async () => {
      await registerBot();
      const ctx = createCtx({ callbackQuery: { data: 'confirm:edit' } });

      await getEventHandler('callback_query:data')(asContext(ctx));

      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });

  describe('workflow selection', () => {
    it('loads the workflow and prompts for the first input', async () => {
      await registerBot();
      service.setSession(CHAT_ID, makeSession({ state: 'selecting' }));
      httpMock.get.mockReturnValue(
        of({
          data: {
            description: 'Makes images',
            id: 'wf-1',
            name: 'Image Gen',
            nodes: {
              promptNode: {
                data: {
                  defaultValue: 'a cat',
                  inputType: 'text',
                  label: 'Prompt',
                  required: true,
                },
                type: 'input',
              },
            },
          },
        }),
      );
      const ctx = createCtx({ callbackQuery: { data: 'wf:wf-1' } });

      await getEventHandler('callback_query:data')(asContext(ctx));

      const session = service.getSession(CHAT_ID);
      expect(session?.state).toBe('collecting');
      expect(session?.workflowId).toBe('wf-1');
      expect(session?.workflowName).toBe('Image Gen');
      expect(session?.requiredInputs).toHaveLength(1);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('requires *1* input(s)'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('type "default" to use it'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('prompts for a photo when the first input is an image', async () => {
      await registerBot();
      service.setSession(CHAT_ID, makeSession({ state: 'selecting' }));
      httpMock.get.mockReturnValue(
        of({
          data: {
            id: 'wf-2',
            name: 'Restyle',
            nodes: {
              imageNode: {
                data: { inputType: 'image', label: 'Source image' },
                type: 'input',
              },
            },
          },
        }),
      );
      const ctx = createCtx({ callbackQuery: { data: 'wf:wf-2' } });

      await getEventHandler('callback_query:data')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Please send a photo.'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('goes straight to confirmation when the workflow has no inputs', async () => {
      await registerBot();
      service.setSession(CHAT_ID, makeSession({ state: 'selecting' }));
      httpMock.get.mockReturnValue(
        of({ data: { id: 'wf-3', name: 'No Inputs' } }),
      );
      const ctx = createCtx({ callbackQuery: { data: 'wf:wf-3' } });

      await getEventHandler('callback_query:data')(asContext(ctx));

      expect(service.getSession(CHAT_ID)?.state).toBe('confirming');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Review your inputs'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('does nothing when there is no session for the chat', async () => {
      await registerBot();
      httpMock.get.mockReturnValue(
        of({ data: { id: 'wf-1', name: 'Image Gen' } }),
      );
      const ctx = createCtx({ callbackQuery: { data: 'wf:wf-1' } });

      await getEventHandler('callback_query:data')(asContext(ctx));

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('replies with a fallback when the workflow lookup fails', async () => {
      await registerBot();
      service.setSession(CHAT_ID, makeSession({ state: 'selecting' }));
      httpMock.get.mockReturnValue(throwError(() => new Error('not found')));
      const ctx = createCtx({ callbackQuery: { data: 'wf:wf-1' } });

      await getEventHandler('callback_query:data')(asContext(ctx));

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to select workflow:',
        expect.objectContaining({ message: 'not found' }),
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        'Failed to load workflow details. Please try again.',
      );
    });
  });

  describe('text message collection', () => {
    it('ignores command-like text', async () => {
      await registerBot();
      const ctx = createCtx({ message: { text: '/status' } });

      await getEventHandler('message:text')(asContext(ctx));

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('ignores messages without a chat', async () => {
      await registerBot();
      const ctx = createCtx({ chat: undefined, message: { text: 'hello' } });

      await getEventHandler('message:text')(asContext(ctx));

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('replies when there is no collecting session', async () => {
      await registerBot();
      const ctx = createCtx({ message: { text: 'hello' } });

      await getEventHandler('message:text')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        'No active workflow. Use /workflows to start one.',
      );
    });

    it('rejects text when an image input is expected', async () => {
      await registerBot();
      service.setSession(
        CHAT_ID,
        makeSession({
          requiredInputs: [
            makeTextInput({
              inputType: 'image',
              label: 'Photo',
              nodeId: 'img',
            }),
          ],
        }),
      );
      const ctx = createCtx({ message: { text: 'hello' } });

      await getEventHandler('message:text')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        "I'm expecting an image, not text. Please send a photo.",
      );
    });

    it('collects a text input and advances to the next prompt', async () => {
      await registerBot();
      service.setSession(
        CHAT_ID,
        makeSession({
          requiredInputs: [
            makeTextInput(),
            makeTextInput({ label: 'Style', nodeId: 'styleNode' }),
          ],
        }),
      );
      const ctx = createCtx({ message: { text: 'a red fox' } });

      await getEventHandler('message:text')(asContext(ctx));

      const session = service.getSession(CHAT_ID);
      expect(session?.collectedInputs.get('promptNode')).toBe('a red fox');
      expect(session?.currentInputIndex).toBe(1);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Input (2/2)'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('substitutes the default value when the user types "default"', async () => {
      await registerBot();
      service.setSession(
        CHAT_ID,
        makeSession({
          requiredInputs: [makeTextInput({ defaultValue: 'a blue whale' })],
        }),
      );
      const ctx = createCtx({ message: { text: 'Default' } });

      await getEventHandler('message:text')(asContext(ctx));

      expect(
        service.getSession(CHAT_ID)?.collectedInputs.get('promptNode'),
      ).toBe('a blue whale');
    });

    it('shows the confirmation summary after the last input', async () => {
      await registerBot();
      service.setSession(
        CHAT_ID,
        makeSession({
          collectedInputs: new Map([['img', 'https://cdn/img.png']]),
          currentInputIndex: 1,
          requiredInputs: [
            makeTextInput({
              inputType: 'image',
              label: 'Photo',
              nodeId: 'img',
            }),
            makeTextInput(),
          ],
          workflowName: 'Image Gen',
        }),
      );
      const ctx = createCtx({ message: { text: 'a red fox' } });

      await getEventHandler('message:text')(asContext(ctx));

      const session = service.getSession(CHAT_ID);
      expect(session?.state).toBe('confirming');
      const summary = ctx.reply.mock.calls
        .map(([text]) => String(text))
        .find((text) => text.includes('Review your inputs'));
      expect(summary).toContain('[Image uploaded]');
      expect(summary).toContain('a red fox');
    });
  });

  describe('photo message collection', () => {
    const photoMessage = {
      photo: [
        { file_id: 'small', height: 90, width: 90 },
        { file_id: 'large', height: 800, width: 800 },
      ],
    };

    function imageSession(
      overrides: Partial<WorkflowSession> = {},
    ): WorkflowSession {
      return makeSession({
        requiredInputs: [
          makeTextInput({ inputType: 'image', label: 'Photo', nodeId: 'img' }),
        ],
        ...overrides,
      });
    }

    it('ignores messages without a chat', async () => {
      await registerBot();
      const ctx = createCtx({ chat: undefined, message: photoMessage });

      await getEventHandler('message:photo')(asContext(ctx));

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('replies when there is no collecting session', async () => {
      await registerBot();
      const ctx = createCtx({ message: photoMessage });

      await getEventHandler('message:photo')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        'No active input collection. Use /workflows to start.',
      );
    });

    it('rejects a photo when a text input is expected', async () => {
      await registerBot();
      service.setSession(
        CHAT_ID,
        makeSession({ requiredInputs: [makeTextInput()] }),
      );
      const ctx = createCtx({ message: photoMessage });

      await getEventHandler('message:photo')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        "I'm not expecting an image right now. Please send text.",
      );
    });

    it('ignores an update without photos', async () => {
      await registerBot();
      service.setSession(CHAT_ID, imageSession());
      const ctx = createCtx({ message: { photo: [] } });

      await getEventHandler('message:photo')(asContext(ctx));

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('mirrors the best photo and stores its durable URL', async () => {
      await registerBot();
      service.setSession(CHAT_ID, imageSession());
      httpMock.post.mockReturnValue(
        of({ data: { data: { url: 'https://cdn.genfeed.ai/mirrored.png' } } }),
      );
      const ctx = createCtx({ message: photoMessage });
      ctx.api.getFile.mockResolvedValue({ file_path: 'photos/large.jpg' });

      await getEventHandler('message:photo')(asContext(ctx));

      expect(ctx.api.getFile).toHaveBeenCalledWith('large');
      expect(httpMock.post).toHaveBeenCalledWith(
        `${API_URL}/v1/internal/integrations/telegram/media`,
        {
          fileUrl:
            'https://api.telegram.org/file/bottest-token/photos/large.jpg',
          organizationId: 'org-123',
        },
        { headers: { Authorization: 'Bearer test-key' } },
      );
      const session = service.getSession(CHAT_ID);
      expect(session?.collectedInputs.get('img')).toBe(
        'https://cdn.genfeed.ai/mirrored.png',
      );
      expect(session?.state).toBe('confirming');
    });

    it('omits the auth header when no API key is configured', async () => {
      await registerBot();
      configMock.API_KEY = '';
      service.setSession(CHAT_ID, imageSession());
      httpMock.post.mockReturnValue(
        of({ data: { data: { url: 'https://cdn.genfeed.ai/mirrored.png' } } }),
      );
      const ctx = createCtx({ message: photoMessage });
      ctx.api.getFile.mockResolvedValue({ file_path: 'photos/large.jpg' });

      await getEventHandler('message:photo')(asContext(ctx));

      expect(httpMock.post).toHaveBeenCalledWith(
        `${API_URL}/v1/internal/integrations/telegram/media`,
        expect.objectContaining({ organizationId: 'org-123' }),
        { headers: undefined },
      );
    });

    it('fails gracefully when the mirror endpoint returns no URL', async () => {
      await registerBot();
      service.setSession(CHAT_ID, imageSession());
      httpMock.post.mockReturnValue(of({ data: { data: {} } }));
      const ctx = createCtx({ message: photoMessage });
      ctx.api.getFile.mockResolvedValue({ file_path: 'photos/large.jpg' });

      await getEventHandler('message:photo')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        'Failed to process the photo. Please try again.',
      );
      expect(service.getSession(CHAT_ID)?.collectedInputs.size).toBe(0);
    });

    it('fails gracefully when the mirror request throws', async () => {
      await registerBot();
      service.setSession(CHAT_ID, imageSession());
      httpMock.post.mockReturnValue(throwError(() => new Error('mirror down')));
      const ctx = createCtx({ message: photoMessage });
      ctx.api.getFile.mockResolvedValue({ file_path: 'photos/large.jpg' });

      await getEventHandler('message:photo')(asContext(ctx));

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to mirror Telegram file:',
        expect.objectContaining({ message: 'mirror down' }),
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        'Failed to process the photo. Please try again.',
      );
    });

    it('fails gracefully when the session has no org', async () => {
      await registerBot();
      service.setSession(CHAT_ID, imageSession({ orgId: undefined }));
      const ctx = createCtx({ message: photoMessage });
      ctx.api.getFile.mockResolvedValue({ file_path: 'photos/large.jpg' });

      await getEventHandler('message:photo')(asContext(ctx));

      expect(httpMock.post).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        'Failed to process the photo. Please try again.',
      );
    });

    it('fails gracefully when the Telegram file lookup throws', async () => {
      await registerBot();
      service.setSession(CHAT_ID, imageSession());
      const ctx = createCtx({ message: photoMessage });
      ctx.api.getFile.mockRejectedValue(new Error('telegram down'));

      await getEventHandler('message:photo')(asContext(ctx));

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to handle photo:',
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        'Failed to process the photo. Please try again.',
      );
    });
  });

  describe('running workflows', () => {
    function confirmedSession(
      overrides: Partial<WorkflowSession> = {},
    ): WorkflowSession {
      return makeSession({
        collectedInputs: new Map([['promptNode', 'a red fox']]),
        currentInputIndex: 1,
        requiredInputs: [makeTextInput()],
        state: 'confirming',
        workflowId: 'wf-1',
        workflowName: 'Image Gen',
        ...overrides,
      });
    }

    function mockExecution(
      status: string,
      extras: Record<string, unknown> = {},
    ) {
      httpMock.post.mockReturnValue(
        of({
          data: { executionId: 'exec-1', nodeResults: [], status: 'running' },
        }),
      );
      httpMock.get.mockReturnValue(
        of({
          data: { executionId: 'exec-1', nodeResults: [], status, ...extras },
        }),
      );
    }

    it('replies when no workflow is selected', async () => {
      await registerBot();
      const ctx = createCtx({ callbackQuery: { data: 'confirm:run' } });

      await getEventHandler('callback_query:data')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        'No workflow selected. Use /workflows to start.',
      );
    });

    it('runs the workflow and delivers an image output', async () => {
      await registerBot();
      service.setSession(CHAT_ID, confirmedSession());
      mockExecution('completed', {
        nodeResults: [
          {
            output: {
              caption: 'A red fox',
              imageUrl: 'https://cdn.genfeed.ai/fox.png',
            },
            status: 'completed',
          },
        ],
      });
      const ctx = createCtx({ callbackQuery: { data: 'confirm:run' } });

      await getEventHandler('callback_query:data')(asContext(ctx));
      await flush();

      expect(httpMock.post).toHaveBeenCalledWith(
        `${API_URL}/v1/internal/orgs/org-123/workflow-executions`,
        {
          inputValues: { promptNode: 'a red fox' },
          metadata: undefined,
          workflowId: 'wf-1',
        },
        { headers: { Authorization: 'Bearer test-key' } },
      );
      expect(ctx.replyWithPhoto).toHaveBeenCalledWith(
        'https://cdn.genfeed.ai/fox.png',
        { caption: 'A red fox' },
      );
      expect(service.getSession(CHAT_ID)).toBeUndefined();
    });

    it('passes stored model preferences as execution metadata', async () => {
      await registerBot();
      const handler = getEventHandler('callback_query:data');
      await handler(
        asContext(
          createCtx({ callbackQuery: { data: `cfg:img:${IMAGE_MODELS[1]}` } }),
        ),
      );

      service.setSession(CHAT_ID, confirmedSession());
      mockExecution('completed');
      const ctx = createCtx({ callbackQuery: { data: 'confirm:run' } });

      await handler(asContext(ctx));
      await flush();

      expect(httpMock.post).toHaveBeenCalledWith(
        `${API_URL}/v1/internal/orgs/org-123/workflow-executions`,
        expect.objectContaining({
          metadata: {
            imageModel: IMAGE_MODELS[1],
            videoModel: VIDEO_MODELS[0],
          },
        }),
        { headers: { Authorization: 'Bearer test-key' } },
      );
    });

    it('delivers video, text and bare-url outputs', async () => {
      await registerBot();
      service.setSession(CHAT_ID, confirmedSession());
      mockExecution('completed', {
        nodeResults: [
          {
            output: { videoUrl: 'https://cdn.genfeed.ai/clip.mp4' },
            status: 'completed',
          },
          {
            output: { text: 'All done!' },
            status: 'completed',
          },
        ],
      });
      const ctx = createCtx({ callbackQuery: { data: 'confirm:run' } });

      await getEventHandler('callback_query:data')(asContext(ctx));
      await flush();

      expect(ctx.replyWithVideo).toHaveBeenCalledWith(
        'https://cdn.genfeed.ai/clip.mp4',
        { caption: 'Generated video' },
      );
      expect(ctx.reply).toHaveBeenCalledWith('All done!');
    });

    it('reports success when the execution produced no outputs', async () => {
      await registerBot();
      service.setSession(CHAT_ID, confirmedSession());
      mockExecution('completed');
      const ctx = createCtx({ callbackQuery: { data: 'confirm:run' } });

      await getEventHandler('callback_query:data')(asContext(ctx));
      await flush();

      expect(ctx.reply).toHaveBeenCalledWith(
        'Workflow completed successfully.',
      );
      expect(service.getSession(CHAT_ID)).toBeUndefined();
    });

    it('classifies an unknown execution error when the workflow fails', async () => {
      await registerBot();
      service.setSession(CHAT_ID, confirmedSession());
      mockExecution('failed', { error: 'GPU pool exhausted' });
      const ctx = createCtx({ callbackQuery: { data: 'confirm:run' } });

      await getEventHandler('callback_query:data')(asContext(ctx));
      await flush();

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Run failed'),
      );
      expect(JSON.stringify(ctx.reply.mock.calls)).not.toContain(
        'GPU pool exhausted',
      );
      expect(service.getSession(CHAT_ID)).toBeUndefined();
    });

    it('uses the fallback message when a failed execution has no error', async () => {
      await registerBot();
      service.setSession(CHAT_ID, confirmedSession());
      mockExecution('failed');
      const ctx = createCtx({ callbackQuery: { data: 'confirm:run' } });

      await getEventHandler('callback_query:data')(asContext(ctx));
      await flush();

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Run failed'),
      );
    });

    it('clears the session silently when the execution was cancelled', async () => {
      await registerBot();
      service.setSession(CHAT_ID, confirmedSession());
      mockExecution('cancelled');
      const ctx = createCtx({ callbackQuery: { data: 'confirm:run' } });

      await getEventHandler('callback_query:data')(asContext(ctx));
      await flush();

      expect(service.getSession(CHAT_ID)).toBeUndefined();
      expect(ctx.replyWithPhoto).not.toHaveBeenCalled();
    });

    it('sends classified provider failures without raw credentials', async () => {
      await registerBot();
      service.setSession(CHAT_ID, confirmedSession());
      mockExecution('failed', { error: 'HTTP 429 Bearer private-token' });
      const ctx = createCtx({ callbackQuery: { data: 'confirm:run' } });
      await getEventHandler('callback_query:data')(asContext(ctx));
      await flush();
      expect(ctx.reply).toHaveBeenCalledWith(
        'Provider rate limited\nThe model provider asked us to slow down.\nWait a moment, then retry the message.',
      );
      expect(JSON.stringify(ctx.reply.mock.calls)).not.toContain(
        'private-token',
      );
      expect(service.getSession(CHAT_ID)).toBeUndefined();
    });

    it('polls until the execution reaches a terminal status', async () => {
      await registerBot();
      (service as unknown as PollingAccess).workflowExecutionPollIntervalMs = 1;
      service.setSession(CHAT_ID, confirmedSession());
      httpMock.post.mockReturnValue(
        of({
          data: { executionId: 'exec-1', nodeResults: [], status: 'running' },
        }),
      );
      httpMock.get
        .mockReturnValueOnce(
          of({ data: { nodeResults: [], status: 'running' } }),
        )
        .mockReturnValue(
          of({ data: { nodeResults: [], status: 'completed' } }),
        );
      const ctx = createCtx({ callbackQuery: { data: 'confirm:run' } });

      await getEventHandler('callback_query:data')(asContext(ctx));
      await flush(30);

      expect(httpMock.get.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(ctx.reply).toHaveBeenCalledWith(
        'Workflow completed successfully.',
      );
    });

    it('tells the user the workflow is still running when polling times out', async () => {
      await registerBot();
      (service as unknown as PollingAccess).workflowExecutionPollTimeoutMs = -1;
      service.setSession(CHAT_ID, confirmedSession());
      httpMock.post.mockReturnValue(
        of({
          data: { executionId: 'exec-1', nodeResults: [], status: 'running' },
        }),
      );
      const ctx = createCtx({ callbackQuery: { data: 'confirm:run' } });

      await getEventHandler('callback_query:data')(asContext(ctx));
      await flush();

      expect(ctx.reply).toHaveBeenCalledWith(
        'Workflow is still running. Use /status to check progress.',
      );
      expect(service.getSession(CHAT_ID)).toBeDefined();
    });

    it('reports a failure when monitoring throws unexpectedly', async () => {
      await registerBot();
      service.setSession(CHAT_ID, confirmedSession());
      httpMock.post.mockReturnValue(
        of({
          data: { executionId: 'exec-1', nodeResults: [], status: 'running' },
        }),
      );
      httpMock.get.mockReturnValue(throwError(() => new Error('api down')));
      const ctx = createCtx({ callbackQuery: { data: 'confirm:run' } });

      await getEventHandler('callback_query:data')(asContext(ctx));
      await flush();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed while monitoring workflow execution:',
        expect.objectContaining({ message: 'api down' }),
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Run failed'),
      );
      expect(service.getSession(CHAT_ID)).toBeUndefined();
    });

    it('fails the run when no execution id is returned', async () => {
      await registerBot();
      service.setSession(CHAT_ID, confirmedSession());
      httpMock.post.mockReturnValue(
        of({ data: { nodeResults: [], status: 'running' } }),
      );
      const ctx = createCtx({ callbackQuery: { data: 'confirm:run' } });

      await getEventHandler('callback_query:data')(asContext(ctx));

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to execute workflow:',
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Run failed'),
      );
      expect(service.getSession(CHAT_ID)).toBeUndefined();
    });

    it('fails the run when the execution request throws', async () => {
      await registerBot();
      service.setSession(CHAT_ID, confirmedSession());
      httpMock.post.mockReturnValue(throwError(() => new Error('api down')));
      const ctx = createCtx({ callbackQuery: { data: 'confirm:run' } });

      await getEventHandler('callback_query:data')(asContext(ctx));

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Run failed'),
      );
      expect(service.getSession(CHAT_ID)).toBeUndefined();
    });

    it('returns without monitoring when the session lacks an execution id', async () => {
      await registerBot();
      const ctx = createCtx();

      await (service as unknown as MonitorAccess).monitorWorkflowExecution(
        'org-123',
        'missing-chat',
        asContext(ctx),
      );

      expect(httpMock.get).not.toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });

  describe('Redis event plumbing', () => {
    it('ignores malformed Redis payloads and only subscribes once', async () => {
      const handlers = new Map<string, (message: unknown) => void>();
      redisMock.subscribe.mockImplementation(
        (channel: string, handler: (message: unknown) => void) => {
          handlers.set(channel, handler);
        },
      );
      httpMock.get.mockReturnValue(of({ data: [] }));

      await service.initialize();
      await service.initialize();

      expect(redisMock.subscribe).toHaveBeenCalledTimes(3);

      handlers.get(REDIS_EVENTS.INTEGRATION_CREATED)?.('not-an-object');
      handlers.get(REDIS_EVENTS.INTEGRATION_CREATED)?.({
        platform: 'TELEGRAM',
      });
      await flush(0);

      // Only the two initialize() calls hit the API — malformed events do not.
      expect(httpMock.get).toHaveBeenCalledTimes(2);
    });

    it('warns when a created integration payload cannot be normalized', async () => {
      httpMock.get.mockReturnValue(of({ data: null }));

      await integrationInternals(service).fetchAndAddIntegration('int-1');

      expect(logger.warn).toHaveBeenCalledWith(
        'Unable to normalize Telegram integration payload: int-1',
      );
      expect(service.getActiveCount()).toBe(0);
    });

    it('warns when an updated integration payload cannot be normalized', async () => {
      httpMock.get.mockReturnValue(of({ data: null }));

      await integrationInternals(service).fetchAndUpdateIntegration('int-1');

      expect(logger.warn).toHaveBeenCalledWith(
        'Unable to normalize Telegram integration payload: int-1',
      );
    });

    it('logs when a Redis event handler fails downstream', async () => {
      const handlers = new Map<string, (message: unknown) => void>();
      redisMock.subscribe.mockImplementation(
        (channel: string, handler: (message: unknown) => void) => {
          handlers.set(channel, handler);
        },
      );
      httpMock.get.mockReturnValue(of({ data: [] }));

      await service.initialize();

      vi.spyOn(service, 'handleRedisEvent').mockRejectedValue(
        new Error('handler blew up'),
      );

      handlers.get(REDIS_EVENTS.INTEGRATION_DELETED)?.({
        integrationId: 'int-1',
        platform: 'TELEGRAM',
      });
      await flush(0);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to handle Redis integration event',
        expect.objectContaining({ message: 'handler blew up' }),
      );
    });
  });

  describe('lifecycle hooks', () => {
    it('initializes on module init and shuts down on module destroy', async () => {
      httpMock.get.mockReturnValue(of({ data: [] }));

      await service.onModuleInit();
      expect(logger.log).toHaveBeenCalledWith(
        'Telegram Bot Manager initialized with 0 bots',
      );

      await service.onModuleDestroy();
      expect(logger.log).toHaveBeenCalledWith(
        'Shutting down Telegram Bot Manager',
      );
    });

    it('rethrows when initialization fails before fetching integrations', async () => {
      redisMock.subscribe.mockRejectedValue(new Error('redis down'));

      await expect(service.initialize()).rejects.toThrow('redis down');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to initialize Telegram Bot Manager:',
        expect.objectContaining({ message: 'redis down' }),
      );
    });

    it('warns when no API key is configured while fetching integrations', async () => {
      configMock.API_KEY = '';
      httpMock.get.mockReturnValue(of({ data: [] }));

      await service.fetchActiveIntegrations();

      expect(logger.warn).toHaveBeenCalledWith(
        'API_KEY not configured; internal integrations request may fail',
      );
    });
  });
});
