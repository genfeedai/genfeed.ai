import {
  IMAGE_MODELS,
  type OrgIntegration,
  type UserSettings,
  VIDEO_MODELS,
  type WorkflowSession,
} from '@genfeedai/integrations';
import type { App } from '@slack/bolt';
import { registerSlackBotHandlers } from '@slack/services/slack-bot-handlers';
import type { Mock } from 'vitest';

interface TestPayload {
  ack?: () => Promise<void>;
  action?: { value?: string };
  body?: { user: { id: string } };
  client?: {
    chat: { postMessage: Mock };
    files: { info: Mock };
  };
  command?: { user_id: string };
  context?: Record<string, unknown>;
  event?: { file_id: string };
  message?: { user?: string; text?: string };
  next?: Mock;
  respond?: Mock;
  say?: Mock;
}

type CapturedHandler = (payload: TestPayload) => Promise<void>;

function createFakeApp() {
  return {
    action: vi.fn(),
    command: vi.fn(),
    event: vi.fn(),
    message: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    use: vi.fn(),
  };
}

function createHandlerMocks() {
  return {
    deleteSession: vi.fn(),
    getSession: vi.fn(),
    getUserSettings: vi.fn(),
    handleCancelCommand: vi.fn().mockResolvedValue(undefined),
    handleEdit: vi.fn().mockResolvedValue(undefined),
    handleRun: vi.fn().mockResolvedValue(undefined),
    handleSettingsCommand: vi.fn().mockResolvedValue(undefined),
    handleStatusCommand: vi.fn().mockResolvedValue(undefined),
    handleWorkflowsCommand: vi.fn().mockResolvedValue(undefined),
    logFileError: vi.fn(),
    promptNextInput: vi.fn().mockResolvedValue(undefined),
    selectWorkflow: vi.fn().mockResolvedValue(undefined),
    setSession: vi.fn(),
    setUserSettings: vi.fn(),
  };
}

function makeIntegration(
  configOverrides: Partial<OrgIntegration['config']> = {},
): OrgIntegration {
  return {
    botToken: 'mock-bot-token',
    config: {
      allowedUserIds: ['U-allowed'],
      appToken: 'mock-app-token',
      ...configOverrides,
    },
    createdAt: new Date('2026-01-01'),
    id: 'integration-1',
    orgId: 'org-1',
    platform: 'SLACK',
    status: 'ACTIVE',
    updatedAt: new Date('2026-01-01'),
  };
}

function makeSession(
  overrides: Partial<WorkflowSession> = {},
): WorkflowSession {
  return {
    collectedInputs: new Map<string, string>(),
    currentInputIndex: 0,
    requiredInputs: [],
    startedAt: Date.now(),
    state: 'collecting',
    ...overrides,
  };
}

describe('registerSlackBotHandlers', () => {
  let app: ReturnType<typeof createFakeApp>;
  let handlers: ReturnType<typeof createHandlerMocks>;
  let ack: Mock;
  let respond: Mock;

  function register(integration: OrgIntegration = makeIntegration()) {
    registerSlackBotHandlers(app as unknown as App, integration, handlers);
  }

  function getHandler(
    calls: Array<Array<unknown>>,
    key: string,
  ): CapturedHandler {
    const call = calls.find((entry) => String(entry[0]) === key);
    if (!call) {
      throw new Error(`No handler registered for ${key}`);
    }
    return call[1] as CapturedHandler;
  }

  function commandHandler(name: string): CapturedHandler {
    return getHandler(app.command.mock.calls, name);
  }

  function actionHandler(key: string): CapturedHandler {
    return getHandler(app.action.mock.calls, key);
  }

  beforeEach(() => {
    app = createFakeApp();
    handlers = createHandlerMocks();
    ack = vi.fn().mockResolvedValue(undefined);
    respond = vi.fn().mockResolvedValue(undefined);
  });

  it('registers middleware, commands, actions, message and event handlers', () => {
    register();

    expect(app.use).toHaveBeenCalledTimes(1);
    expect(app.command).toHaveBeenCalledTimes(4);
    expect(app.action).toHaveBeenCalledTimes(6);
    expect(app.message).toHaveBeenCalledTimes(1);
    expect(app.event).toHaveBeenCalledWith('file_shared', expect.any(Function));
  });

  describe('authorization middleware', () => {
    it('calls next for an allowlisted user', async () => {
      register();
      const middleware = app.use.mock.calls[0][0] as CapturedHandler;
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware({ context: { userId: 'U-allowed' }, next });

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('blocks users not on the allowlist', async () => {
      register();
      const middleware = app.use.mock.calls[0][0] as CapturedHandler;
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware({ context: { userId: 'U-stranger' }, next });

      expect(next).not.toHaveBeenCalled();
    });

    it('blocks payloads without a userId even on an open bot', async () => {
      register(makeIntegration({ allowedUserIds: [], isOpenToAllUsers: true }));
      const middleware = app.use.mock.calls[0][0] as CapturedHandler;
      const next = vi.fn().mockResolvedValue(undefined);

      await middleware({ context: {}, next });

      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('slash commands', () => {
    it('/workflows acks and delegates with user and org id', async () => {
      register();

      await commandHandler('/workflows')({
        ack,
        command: { user_id: 'U-allowed' },
        respond,
      });

      expect(ack).toHaveBeenCalled();
      expect(handlers.handleWorkflowsCommand).toHaveBeenCalledWith(
        'U-allowed',
        'org-1',
        respond,
      );
    });

    it('/status acks and delegates', async () => {
      register();

      await commandHandler('/status')({
        ack,
        command: { user_id: 'U-allowed' },
        respond,
      });

      expect(ack).toHaveBeenCalled();
      expect(handlers.handleStatusCommand).toHaveBeenCalledWith(
        'U-allowed',
        respond,
      );
    });

    it('/cancel acks and delegates', async () => {
      register();

      await commandHandler('/cancel')({
        ack,
        command: { user_id: 'U-allowed' },
        respond,
      });

      expect(ack).toHaveBeenCalled();
      expect(handlers.handleCancelCommand).toHaveBeenCalledWith(
        'U-allowed',
        respond,
      );
    });

    it('/settings acks and delegates', async () => {
      register();

      await commandHandler('/settings')({
        ack,
        command: { user_id: 'U-allowed' },
        respond,
      });

      expect(ack).toHaveBeenCalled();
      expect(handlers.handleSettingsCommand).toHaveBeenCalledWith(
        'U-allowed',
        respond,
      );
    });
  });

  describe('workflow selection action', () => {
    it('strips the wf: prefix and delegates to selectWorkflow', async () => {
      register();

      await actionHandler('/^wf:/')({
        ack,
        action: { value: 'wf:workflow-42' },
        body: { user: { id: 'U-allowed' } },
        respond,
      });

      expect(ack).toHaveBeenCalled();
      expect(handlers.selectWorkflow).toHaveBeenCalledWith(
        'U-allowed',
        'org-1',
        'workflow-42',
        respond,
      );
    });

    it('falls back to an empty workflow id when the action has no value', async () => {
      register();

      await actionHandler('/^wf:/')({
        ack,
        action: {},
        body: { user: { id: 'U-allowed' } },
        respond,
      });

      expect(handlers.selectWorkflow).toHaveBeenCalledWith(
        'U-allowed',
        'org-1',
        '',
        respond,
      );
    });
  });

  describe('confirmation actions', () => {
    it('confirm:run delegates to handleRun', async () => {
      register();

      await actionHandler('confirm:run')({
        ack,
        body: { user: { id: 'U-allowed' } },
        respond,
      });

      expect(ack).toHaveBeenCalled();
      expect(handlers.handleRun).toHaveBeenCalledWith(
        'U-allowed',
        'org-1',
        respond,
      );
    });

    it('confirm:edit delegates to handleEdit', async () => {
      register();

      await actionHandler('confirm:edit')({
        ack,
        body: { user: { id: 'U-allowed' } },
        respond,
      });

      expect(handlers.handleEdit).toHaveBeenCalledWith('U-allowed', respond);
    });

    it('confirm:cancel deletes the session and replaces the message', async () => {
      register();

      await actionHandler('confirm:cancel')({
        ack,
        body: { user: { id: 'U-allowed' } },
        respond,
      });

      expect(handlers.deleteSession).toHaveBeenCalledWith('U-allowed');
      expect(respond).toHaveBeenCalledWith({
        replace_original: true,
        text: 'Cancelled. Use /workflows to start again.',
      });
    });
  });

  describe('settings actions', () => {
    it('cfg:img sets the image model on existing settings', async () => {
      const settings: UserSettings = {
        imageModel: 'sdxl',
        videoModel: 'kling-ai',
      };
      handlers.getUserSettings.mockReturnValue(settings);
      register();

      await actionHandler('/^cfg:img:/')({
        ack,
        action: { value: 'cfg:img:flux-pro' },
        body: { user: { id: 'U-allowed' } },
        respond,
      });

      expect(handlers.setUserSettings).toHaveBeenCalledWith('U-allowed', {
        imageModel: 'flux-pro',
        videoModel: 'kling-ai',
      });
      expect(respond).toHaveBeenCalledWith({
        text: 'Image model set to: *flux-pro*',
      });
    });

    it('cfg:img falls back to default settings when none exist', async () => {
      handlers.getUserSettings.mockReturnValue(undefined);
      register();

      await actionHandler('/^cfg:img:/')({
        ack,
        action: { value: 'cfg:img:midjourney' },
        body: { user: { id: 'U-allowed' } },
        respond,
      });

      expect(handlers.setUserSettings).toHaveBeenCalledWith('U-allowed', {
        imageModel: 'midjourney',
        videoModel: VIDEO_MODELS[0],
      });
    });

    it('cfg:vid sets the video model on existing settings', async () => {
      const settings: UserSettings = {
        imageModel: 'sdxl',
        videoModel: 'kling-ai',
      };
      handlers.getUserSettings.mockReturnValue(settings);
      register();

      await actionHandler('/^cfg:vid:/')({
        ack,
        action: { value: 'cfg:vid:runway-gen3' },
        body: { user: { id: 'U-allowed' } },
        respond,
      });

      expect(handlers.setUserSettings).toHaveBeenCalledWith('U-allowed', {
        imageModel: 'sdxl',
        videoModel: 'runway-gen3',
      });
      expect(respond).toHaveBeenCalledWith({
        text: 'Video model set to: *runway-gen3*',
      });
    });

    it('cfg:vid falls back to default settings when none exist', async () => {
      handlers.getUserSettings.mockReturnValue(undefined);
      register();

      await actionHandler('/^cfg:vid:/')({
        ack,
        action: {},
        body: { user: { id: 'U-allowed' } },
        respond,
      });

      expect(handlers.setUserSettings).toHaveBeenCalledWith('U-allowed', {
        imageModel: IMAGE_MODELS[0],
        videoModel: '',
      });
    });
  });

  describe('message handler (text input collection)', () => {
    function messageHandler(): CapturedHandler {
      return app.message.mock.calls[0][0] as CapturedHandler;
    }

    it('ignores messages without a user or text', async () => {
      register();
      const say = vi.fn();

      await messageHandler()({ message: { text: 'hi' }, say });
      await messageHandler()({ message: { user: 'U-allowed' }, say });

      expect(handlers.getSession).not.toHaveBeenCalled();
    });

    it('ignores messages when there is no collecting session', async () => {
      handlers.getSession.mockReturnValue(undefined);
      register();
      const say = vi.fn();

      await messageHandler()({
        message: { text: 'hello', user: 'U-allowed' },
        say,
      });

      expect(handlers.setSession).not.toHaveBeenCalled();
    });

    it('ignores messages when the session is not collecting', async () => {
      handlers.getSession.mockReturnValue(makeSession({ state: 'running' }));
      register();
      const say = vi.fn();

      await messageHandler()({
        message: { text: 'hello', user: 'U-allowed' },
        say,
      });

      expect(handlers.setSession).not.toHaveBeenCalled();
    });

    it('ignores messages when the current input expects an image', async () => {
      handlers.getSession.mockReturnValue(
        makeSession({
          requiredInputs: [
            { inputType: 'image', label: 'Photo', nodeId: 'node-1' },
          ],
        }),
      );
      register();
      const say = vi.fn();

      await messageHandler()({
        message: { text: 'hello', user: 'U-allowed' },
        say,
      });

      expect(handlers.setSession).not.toHaveBeenCalled();
    });

    it('collects a text value and prompts for the next input', async () => {
      const session = makeSession({
        requiredInputs: [
          { inputType: 'text', label: 'Topic', nodeId: 'node-1' },
        ],
      });
      handlers.getSession.mockReturnValue(session);
      register();
      const say = vi.fn();

      await messageHandler()({
        message: { text: 'AI content', user: 'U-allowed' },
        say,
      });

      expect(session.collectedInputs.get('node-1')).toBe('AI content');
      expect(session.currentInputIndex).toBe(1);
      expect(handlers.setSession).toHaveBeenCalledWith('U-allowed', session);
      expect(handlers.promptNextInput).toHaveBeenCalledWith('U-allowed', say);
    });

    it('substitutes the default value when the user types "default"', async () => {
      const session = makeSession({
        requiredInputs: [
          {
            defaultValue: 'fallback-topic',
            inputType: 'text',
            label: 'Topic',
            nodeId: 'node-1',
          },
        ],
      });
      handlers.getSession.mockReturnValue(session);
      register();
      const say = vi.fn();

      await messageHandler()({
        message: { text: 'DEFAULT', user: 'U-allowed' },
        say,
      });

      expect(session.collectedInputs.get('node-1')).toBe('fallback-topic');
    });
  });

  describe('file_shared event (image input collection)', () => {
    function eventHandler(): CapturedHandler {
      return getHandler(app.event.mock.calls, 'file_shared') as CapturedHandler;
    }

    function makeClient(fileInfo: unknown) {
      return {
        chat: { postMessage: vi.fn().mockResolvedValue(undefined) },
        files: { info: vi.fn().mockResolvedValue(fileInfo) },
      };
    }

    it('ignores events when the file has no user', async () => {
      register();
      const client = makeClient({ file: { url_private: 'https://f' } });

      await eventHandler()({ client, event: { file_id: 'F1' } });

      expect(handlers.getSession).not.toHaveBeenCalled();
    });

    it('ignores events when there is no collecting session', async () => {
      handlers.getSession.mockReturnValue(makeSession({ state: 'confirming' }));
      register();
      const client = makeClient({
        file: { url_private: 'https://f', user: 'U-allowed' },
      });

      await eventHandler()({ client, event: { file_id: 'F1' } });

      expect(handlers.setSession).not.toHaveBeenCalled();
    });

    it('ignores files when the current input expects text', async () => {
      handlers.getSession.mockReturnValue(
        makeSession({
          requiredInputs: [
            { inputType: 'text', label: 'Topic', nodeId: 'node-1' },
          ],
        }),
      );
      register();
      const client = makeClient({
        file: { url_private: 'https://f', user: 'U-allowed' },
      });

      await eventHandler()({ client, event: { file_id: 'F1' } });

      expect(handlers.setSession).not.toHaveBeenCalled();
    });

    it('collects the image url, advances, and confirms in the channel', async () => {
      const session = makeSession({
        requiredInputs: [
          { inputType: 'image', label: 'Photo', nodeId: 'node-1' },
        ],
      });
      handlers.getSession.mockReturnValue(session);
      register();
      const client = makeClient({
        file: {
          channels: ['C1', 'C2'],
          url_private: 'https://files.slack/photo.png',
          user: 'U-allowed',
        },
      });

      await eventHandler()({ client, event: { file_id: 'F1' } });

      expect(client.files.info).toHaveBeenCalledWith({ file: 'F1' });
      expect(session.collectedInputs.get('node-1')).toBe(
        'https://files.slack/photo.png',
      );
      expect(session.currentInputIndex).toBe(1);
      expect(handlers.setSession).toHaveBeenCalledWith('U-allowed', session);
      expect(client.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C1',
        text: 'Image received.',
      });
    });

    it('stores an empty url and skips the channel ack when file has no channels', async () => {
      const session = makeSession({
        requiredInputs: [
          { inputType: 'image', label: 'Photo', nodeId: 'node-1' },
        ],
      });
      handlers.getSession.mockReturnValue(session);
      register();
      const client = makeClient({
        file: { channels: [], user: 'U-allowed' },
      });

      await eventHandler()({ client, event: { file_id: 'F1' } });

      expect(session.collectedInputs.get('node-1')).toBe('');
      expect(client.chat.postMessage).not.toHaveBeenCalled();
    });

    it('routes files.info failures to logFileError', async () => {
      register();
      const failure = new Error('slack api down');
      const client = {
        chat: { postMessage: vi.fn() },
        files: { info: vi.fn().mockRejectedValue(failure) },
      };

      await eventHandler()({ client, event: { file_id: 'F1' } });

      expect(handlers.logFileError).toHaveBeenCalledWith(failure);
    });
  });
});
