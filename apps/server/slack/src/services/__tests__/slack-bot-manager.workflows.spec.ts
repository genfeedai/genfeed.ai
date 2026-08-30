import type { OrgIntegration, WorkflowSession } from '@genfeedai/integrations';
import { REDIS_EVENTS } from '@genfeedai/integrations';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@slack/config/config.service';
import { SlackBotManager } from '@slack/services/slack-bot-manager.service';
import { of, throwError } from 'rxjs';
import type { Mock } from 'vitest';

// Mock @slack/bolt so createBotInstance registers real handlers on a capturable app
const { mockApp, MockAppConstructor } = vi.hoisted(() => {
  const app = {
    action: vi.fn(),
    command: vi.fn(),
    event: vi.fn(),
    message: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    use: vi.fn(),
  };
  const ctor = vi.fn(function mockAppCtor() {
    return app;
  });
  return { MockAppConstructor: ctor, mockApp: app };
});

vi.mock('@slack/bolt', () => ({
  App: MockAppConstructor,
}));

interface TestPayload {
  ack?: Mock;
  action?: { value?: string };
  body?: { user: { id: string } };
  client?: {
    chat: { postMessage: Mock };
    files: { info: Mock };
  };
  command?: { user_id: string };
  event?: { file_id: string };
  message?: { user?: string; text?: string };
  respond?: Mock;
  say?: Mock;
}

type CapturedHandler = (payload: TestPayload) => Promise<void>;

interface MockLogger {
  debug: Mock;
  error: Mock;
  log: Mock;
  warn: Mock;
}

const USER_ID = 'U-1';
const ORG_ID = 'org-1';
const API_URL = 'http://localhost:3010';

function makeSession(
  overrides: Partial<WorkflowSession> = {},
): WorkflowSession {
  return {
    collectedInputs: new Map<string, string>(),
    currentInputIndex: 0,
    orgId: ORG_ID,
    requiredInputs: [],
    startedAt: Date.now(),
    state: 'collecting',
    ...overrides,
  };
}

function makeIntegration(
  configOverrides: Partial<OrgIntegration['config']> = {},
): OrgIntegration {
  return {
    botToken: 'mock-bot-token',
    config: {
      allowedUserIds: [USER_ID],
      appToken: 'mock-app-token',
      ...configOverrides,
    },
    createdAt: new Date('2026-01-01'),
    id: 'integration-1',
    orgId: ORG_ID,
    platform: 'SLACK',
    status: 'ACTIVE',
    updatedAt: new Date('2026-01-01'),
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SlackBotManager workflows', () => {
  let service: SlackBotManager;
  let httpService: { get: Mock; patch: Mock; post: Mock };
  let redisService: { subscribe: Mock; unsubscribe: Mock };
  let logger: MockLogger;
  let respond: Mock;

  function sessions(): Map<string, WorkflowSession> {
    return service['sessions'];
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
    return getHandler(mockApp.command.mock.calls, name);
  }

  function actionHandler(key: string): CapturedHandler {
    return getHandler(mockApp.action.mock.calls, key);
  }

  beforeEach(async () => {
    const mockConfigService = {
      API_KEY: 'test-key',
      API_URL,
      get: vi.fn(),
    };

    httpService = {
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
    };

    redisService = {
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    };
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackBotManager,
        { provide: LoggerService, useValue: logger },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: httpService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<SlackBotManager>(SlackBotManager);

    respond = vi.fn().mockResolvedValue(undefined);
    mockApp.start.mockResolvedValue(undefined);
    mockApp.stop.mockResolvedValue(undefined);
  });

  describe('registered bot handlers', () => {
    const ack = vi.fn().mockResolvedValue(undefined);

    beforeEach(async () => {
      httpService.get.mockReturnValue(of({ data: [] }));
      await service.createBotInstance(makeIntegration());
    });

    describe('/workflows', () => {
      it('rejects while a workflow is running', async () => {
        sessions().set(USER_ID, makeSession({ state: 'running' }));

        await commandHandler('/workflows')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });

        expect(respond).toHaveBeenCalledWith({
          text: 'A workflow is running. Use /status to check progress or /cancel to abort.',
        });
      });

      it('reports when the org has no workflows', async () => {
        await commandHandler('/workflows')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });

        expect(httpService.get).toHaveBeenCalledWith(
          `${API_URL}/v1/orgs/${ORG_ID}/workflows`,
          undefined,
        );
        expect(respond).toHaveBeenCalledWith({
          text: 'No workflows available for your organization.',
        });
        expect(sessions().has(USER_ID)).toBe(false);
      });

      it('lists workflows and opens a selecting session', async () => {
        httpService.get.mockReturnValue(
          of({
            data: [
              { description: 'Makes posts', id: 'wf-1', name: 'Poster' },
              { id: 'wf-2', name: 'Plain' },
            ],
          }),
        );

        await commandHandler('/workflows')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });

        const session = sessions().get(USER_ID);
        expect(session?.state).toBe('selecting');
        expect(session?.orgId).toBe(ORG_ID);
        expect(respond).toHaveBeenCalledWith({
          blocks: [
            expect.objectContaining({ type: 'section' }),
            { type: 'divider' },
            expect.objectContaining({
              accessory: expect.objectContaining({ action_id: 'wf:wf-1' }),
              text: {
                text: '*Poster*\nMakes posts',
                type: 'mrkdwn',
              },
            }),
            expect.objectContaining({
              accessory: expect.objectContaining({ action_id: 'wf:wf-2' }),
              text: { text: '*Plain*', type: 'mrkdwn' },
            }),
          ],
          text: 'GenFeed AI Workflows',
        });
      });

      it('responds with a fallback when Slack delivery fails', async () => {
        httpService.get.mockReturnValue(
          of({ data: [{ id: 'wf-1', name: 'Poster' }] }),
        );
        respond.mockRejectedValueOnce(new Error('slack down'));

        await commandHandler('/workflows')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to fetch workflows',
          expect.objectContaining({ message: 'slack down' }),
        );
        expect(respond).toHaveBeenLastCalledWith({
          text: 'Failed to load workflows. Please try again.',
        });
      });

      it('reports no workflows when the workflows fetch fails', async () => {
        httpService.get.mockReturnValue(
          throwError(() => new Error('api down')),
        );

        await commandHandler('/workflows')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to fetch workflows',
          expect.objectContaining({ message: 'api down' }),
        );
        expect(respond).toHaveBeenCalledWith({
          text: 'No workflows available for your organization.',
        });
      });
    });

    describe('/status', () => {
      it('reports idle without a session', async () => {
        await commandHandler('/status')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });

        expect(respond).toHaveBeenCalledWith({
          text: '*GenFeed Bot Status*\n\nYour status: Idle - no active workflow',
        });
      });

      it('reports selecting, collecting, and confirming states', async () => {
        sessions().set(USER_ID, makeSession({ state: 'selecting' }));
        await commandHandler('/status')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });
        expect(respond).toHaveBeenLastCalledWith({
          text: '*GenFeed Bot Status*\n\nYour status: Selecting a workflow',
        });

        sessions().set(
          USER_ID,
          makeSession({
            currentInputIndex: 1,
            requiredInputs: [
              { inputType: 'text', label: 'A', nodeId: 'n1' },
              { inputType: 'text', label: 'B', nodeId: 'n2' },
            ],
            state: 'collecting',
          }),
        );
        await commandHandler('/status')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });
        expect(respond).toHaveBeenLastCalledWith({
          text: '*GenFeed Bot Status*\n\nYour status: Collecting inputs (1/2)',
        });

        sessions().set(USER_ID, makeSession({ state: 'confirming' }));
        await commandHandler('/status')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });
        expect(respond).toHaveBeenLastCalledWith({
          text: '*GenFeed Bot Status*\n\nYour status: Waiting for confirmation',
        });
      });

      it('reports the live execution status while running', async () => {
        sessions().set(
          USER_ID,
          makeSession({
            executionId: 'exec-1',
            state: 'running',
            workflowName: 'Poster',
          }),
        );
        httpService.get.mockReturnValue(
          of({
            data: { executionId: 'exec-1', nodeResults: [], status: 'running' },
          }),
        );

        await commandHandler('/status')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });

        expect(httpService.get).toHaveBeenCalledWith(
          `${API_URL}/v1/internal/orgs/${ORG_ID}/workflow-executions/exec-1`,
          { headers: { Authorization: 'Bearer test-key' } },
        );
        expect(respond).toHaveBeenCalledWith({
          text: '*GenFeed Bot Status*\n\nYour status: Running *Poster* (running)',
        });
      });

      it('keeps the basic running line when the execution fetch fails', async () => {
        sessions().set(
          USER_ID,
          makeSession({
            executionId: 'exec-1',
            state: 'running',
            workflowName: 'Poster',
          }),
        );
        httpService.get.mockReturnValue(throwError(() => new Error('boom')));

        await commandHandler('/status')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });

        expect(logger.warn).toHaveBeenCalledWith(
          'Failed to fetch workflow execution status',
          expect.objectContaining({ executionId: 'exec-1' }),
        );
        expect(respond).toHaveBeenCalledWith({
          text: '*GenFeed Bot Status*\n\nYour status: Running *Poster*',
        });
      });

      it('reports running without polling when there is no execution id', async () => {
        sessions().set(
          USER_ID,
          makeSession({ state: 'running', workflowName: 'Poster' }),
        );

        await commandHandler('/status')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });

        expect(httpService.get).not.toHaveBeenCalled();
        expect(respond).toHaveBeenCalledWith({
          text: '*GenFeed Bot Status*\n\nYour status: Running *Poster*',
        });
      });
    });

    describe('/cancel', () => {
      it('reports nothing to cancel without a session', async () => {
        await commandHandler('/cancel')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });

        expect(respond).toHaveBeenCalledWith({ text: 'Nothing to cancel.' });
      });

      it('reports nothing to cancel for an idle session', async () => {
        sessions().set(USER_ID, makeSession({ state: 'idle' }));

        await commandHandler('/cancel')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });

        expect(respond).toHaveBeenCalledWith({ text: 'Nothing to cancel.' });
      });

      it('cancels the running execution and clears the session', async () => {
        sessions().set(
          USER_ID,
          makeSession({ executionId: 'exec-1', state: 'running' }),
        );
        httpService.patch.mockReturnValue(of({ data: {} }));

        await commandHandler('/cancel')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });

        expect(httpService.patch).toHaveBeenCalledWith(
          `${API_URL}/v1/internal/orgs/${ORG_ID}/workflow-executions/exec-1`,
          { status: 'cancelled' },
          { headers: { Authorization: 'Bearer test-key' } },
        );
        expect(sessions().has(USER_ID)).toBe(false);
        expect(respond).toHaveBeenCalledWith({
          text: 'Cancelled. Use /workflows to start again.',
        });
      });

      it('still clears the session when the cancel request fails', async () => {
        sessions().set(
          USER_ID,
          makeSession({ executionId: 'exec-1', state: 'running' }),
        );
        httpService.patch.mockReturnValue(throwError(() => new Error('nope')));

        await commandHandler('/cancel')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });

        expect(logger.warn).toHaveBeenCalledWith(
          'Failed to cancel workflow execution',
          expect.objectContaining({ executionId: 'exec-1' }),
        );
        expect(sessions().has(USER_ID)).toBe(false);
        expect(respond).toHaveBeenCalledWith({
          text: 'Cancelled. Use /workflows to start again.',
        });
      });
    });

    describe('/settings', () => {
      it('shows the default model menu when the user has no settings', async () => {
        await commandHandler('/settings')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });

        expect(respond).toHaveBeenCalledWith({
          blocks: expect.arrayContaining([
            {
              text: { text: '*Image Model:*', type: 'mrkdwn' },
              type: 'section',
            },
            {
              text: { text: '*Video Model:*', type: 'mrkdwn' },
              type: 'section',
            },
          ]),
          text: 'Settings',
        });
      });

      it('brackets the currently selected models', async () => {
        service['userSettings'].set(USER_ID, {
          imageModel: 'flux-pro',
          videoModel: 'kling-ai',
        });

        await commandHandler('/settings')({
          ack,
          command: { user_id: USER_ID },
          respond,
        });

        const payload = respond.mock.calls[0][0] as {
          blocks: Array<{
            elements?: Array<{ text: { text: string } }>;
          }>;
        };
        const buttonLabels = payload.blocks
          .flatMap((block) => block.elements ?? [])
          .map((element) => element.text.text);
        expect(buttonLabels).toContain('[flux-pro]');
        expect(buttonLabels).toContain('[kling-ai]');
      });
    });

    describe('settings actions', () => {
      it('cfg:img persists the chosen image model', async () => {
        await actionHandler('/^cfg:img:/')({
          ack,
          action: { value: 'cfg:img:flux-pro' },
          body: { user: { id: USER_ID } },
          respond,
        });

        expect(service['userSettings'].get(USER_ID)).toEqual({
          imageModel: 'flux-pro',
          videoModel: 'luma-dream-machine',
        });
        expect(respond).toHaveBeenCalledWith({
          text: 'Image model set to: *flux-pro*',
        });
      });

      it('cfg:vid persists the chosen video model', async () => {
        await actionHandler('/^cfg:vid:/')({
          ack,
          action: { value: 'cfg:vid:kling-ai' },
          body: { user: { id: USER_ID } },
          respond,
        });

        expect(service['userSettings'].get(USER_ID)).toEqual({
          imageModel: 'flux-dev',
          videoModel: 'kling-ai',
        });
      });
    });

    describe('workflow selection (wf: action)', () => {
      it('loads the workflow, collects state, and prompts the first input', async () => {
        sessions().set(USER_ID, makeSession({ state: 'selecting' }));
        httpService.get.mockReturnValue(
          of({
            data: {
              description: 'Generates a post',
              id: 'wf-1',
              name: 'Poster',
              nodes: {
                n1: {
                  data: {
                    defaultValue: 'cats',
                    inputType: 'text',
                    label: 'Topic',
                  },
                  type: 'input',
                },
                n2: { type: 'output' },
              },
            },
          }),
        );

        await actionHandler('/^wf:/')({
          ack,
          action: { value: 'wf:wf-1' },
          body: { user: { id: USER_ID } },
          respond,
        });

        const session = sessions().get(USER_ID);
        expect(session?.state).toBe('collecting');
        expect(session?.workflowId).toBe('wf-1');
        expect(session?.workflowName).toBe('Poster');
        expect(session?.requiredInputs).toHaveLength(1);
        expect(respond).toHaveBeenCalledWith({
          replace_original: true,
          text: '*Poster*\nGenerates a post\nThis workflow requires *1* input(s).',
        });
        expect(respond).toHaveBeenCalledWith({
          text: '*Input (1/1):* Topic\n\nPlease enter a text value.\nDefault: `cats` (type "default" to use it)',
        });
      });

      it('returns quietly when the session disappeared', async () => {
        httpService.get.mockReturnValue(
          of({ data: { id: 'wf-1', name: 'Poster' } }),
        );

        await actionHandler('/^wf:/')({
          ack,
          action: { value: 'wf:wf-1' },
          body: { user: { id: USER_ID } },
          respond,
        });

        expect(respond).not.toHaveBeenCalled();
      });

      it('responds with an error when the workflow fetch fails', async () => {
        sessions().set(USER_ID, makeSession({ state: 'selecting' }));
        httpService.get.mockReturnValue(throwError(() => new Error('404')));

        await actionHandler('/^wf:/')({
          ack,
          action: { value: 'wf:wf-1' },
          body: { user: { id: USER_ID } },
          respond,
        });

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to select workflow',
          expect.objectContaining({ message: '404' }),
        );
        expect(respond).toHaveBeenCalledWith({
          text: 'Failed to load workflow details. Please try again.',
        });
      });
    });

    describe('message handler (text collection)', () => {
      function messageHandler(): CapturedHandler {
        return mockApp.message.mock.calls[0][0] as CapturedHandler;
      }

      it('collects the final text input and shows the confirmation summary', async () => {
        const session = makeSession({
          requiredInputs: [{ inputType: 'text', label: 'Topic', nodeId: 'n1' }],
          workflowName: 'Poster',
        });
        sessions().set(USER_ID, session);
        const say = vi.fn().mockResolvedValue(undefined);

        await messageHandler()({
          message: { text: 'AI news', user: USER_ID },
          say,
        });

        expect(session.collectedInputs.get('n1')).toBe('AI news');
        expect(session.state).toBe('confirming');
        expect(say).toHaveBeenCalledWith({
          blocks: [
            {
              text: {
                text: '*Review your inputs:*\n\n*Workflow:* Poster\n\n*Topic:* AI news',
                type: 'mrkdwn',
              },
              type: 'section',
            },
            expect.objectContaining({ type: 'actions' }),
          ],
          text: 'Review your inputs',
        });
      });

      it('shows placeholders for image inputs and empty values in the summary', async () => {
        const session = makeSession({
          collectedInputs: new Map([['n1', 'https://img.png']]),
          currentInputIndex: 1,
          requiredInputs: [
            { inputType: 'image', label: 'Photo', nodeId: 'n1' },
            { inputType: 'text', label: 'Note', nodeId: 'n2' },
          ],
          workflowName: 'Poster',
        });
        sessions().set(USER_ID, session);
        const say = vi.fn().mockResolvedValue(undefined);

        // Collecting the last input triggers showConfirmation; n2 collected now
        session.collectedInputs.delete('n2');
        await messageHandler()({
          message: { text: 'a note', user: USER_ID },
          say,
        });

        expect(say).toHaveBeenCalledWith(
          expect.objectContaining({
            blocks: expect.arrayContaining([
              expect.objectContaining({
                text: expect.objectContaining({
                  text: expect.stringContaining('*Photo:* [Image uploaded]'),
                }),
              }),
            ]),
          }),
        );
      });

      it('prompts for the next input when more are required', async () => {
        const session = makeSession({
          requiredInputs: [
            { inputType: 'text', label: 'Topic', nodeId: 'n1' },
            { inputType: 'image', label: 'Photo', nodeId: 'n2' },
          ],
        });
        sessions().set(USER_ID, session);
        const say = vi.fn().mockResolvedValue(undefined);

        await messageHandler()({
          message: { text: 'AI news', user: USER_ID },
          say,
        });

        expect(say).toHaveBeenCalledWith({
          text: '*Input (2/2):* Photo\n\nPlease upload a photo.',
        });
      });
    });

    describe('file_shared handler (image collection)', () => {
      function eventHandler(): CapturedHandler {
        return getHandler(mockApp.event.mock.calls, 'file_shared');
      }

      it('collects the shared image and acknowledges in-channel', async () => {
        const session = makeSession({
          requiredInputs: [
            { inputType: 'image', label: 'Photo', nodeId: 'n1' },
            { inputType: 'text', label: 'Note', nodeId: 'n2' },
          ],
        });
        sessions().set(USER_ID, session);
        const client = {
          chat: { postMessage: vi.fn().mockResolvedValue(undefined) },
          files: {
            info: vi.fn().mockResolvedValue({
              file: {
                channels: ['C1'],
                url_private: 'https://files/img.png',
                user: USER_ID,
              },
            }),
          },
        };

        await eventHandler()({ client, event: { file_id: 'F1' } });

        expect(session.collectedInputs.get('n1')).toBe('https://files/img.png');
        expect(client.chat.postMessage).toHaveBeenCalledWith({
          channel: 'C1',
          text: 'Image received.',
        });
      });

      it('logs upload failures through the manager logger', async () => {
        const client = {
          chat: { postMessage: vi.fn() },
          files: { info: vi.fn().mockRejectedValue(new Error('api down')) },
        };

        await eventHandler()({ client, event: { file_id: 'F1' } });

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to handle file upload',
          expect.objectContaining({ message: 'api down' }),
        );
      });
    });

    describe('confirm:run', () => {
      it('rejects when no workflow was selected', async () => {
        await actionHandler('confirm:run')({
          ack,
          body: { user: { id: USER_ID } },
          respond,
        });

        expect(respond).toHaveBeenCalledWith({
          text: 'No workflow selected. Use /workflows to start.',
        });
      });

      it('creates the execution with settings metadata and relays outputs', async () => {
        sessions().set(
          USER_ID,
          makeSession({
            collectedInputs: new Map([['n1', 'AI news']]),
            state: 'confirming',
            workflowId: 'wf-1',
            workflowName: 'Poster',
          }),
        );
        service['userSettings'].set(USER_ID, {
          imageModel: 'flux-pro',
          videoModel: 'kling-ai',
        });
        httpService.post.mockReturnValue(
          of({
            data: { executionId: 'exec-1', nodeResults: [], status: 'running' },
          }),
        );
        httpService.get.mockReturnValue(
          of({
            data: {
              executionId: 'exec-1',
              nodeResults: [
                { output: { caption: 'A cat', imageUrl: 'https://x/cat.png' } },
                { output: { text: 'All done' } },
                { output: {} },
              ],
              status: 'completed',
            },
          }),
        );

        await actionHandler('confirm:run')({
          ack,
          body: { user: { id: USER_ID } },
          respond,
        });
        await flush();

        expect(httpService.post).toHaveBeenCalledWith(
          `${API_URL}/v1/internal/orgs/${ORG_ID}/workflow-executions`,
          {
            inputValues: { n1: 'AI news' },
            metadata: { imageModel: 'flux-pro', videoModel: 'kling-ai' },
            workflowId: 'wf-1',
          },
          { headers: { Authorization: 'Bearer test-key' } },
        );
        expect(respond).toHaveBeenCalledWith({
          replace_original: true,
          text: 'Running *Poster*...\nUse /status to check progress.',
        });
        expect(respond).toHaveBeenCalledWith({
          text: 'A cat\nhttps://x/cat.png',
        });
        expect(respond).toHaveBeenCalledWith({ text: 'All done' });
        expect(sessions().has(USER_ID)).toBe(false);
      });

      it('omits metadata when the user has no settings', async () => {
        sessions().set(
          USER_ID,
          makeSession({
            state: 'confirming',
            workflowId: 'wf-1',
            workflowName: 'Poster',
          }),
        );
        httpService.post.mockReturnValue(
          of({
            data: { executionId: 'exec-1', nodeResults: [], status: 'running' },
          }),
        );
        httpService.get.mockReturnValue(
          of({
            data: {
              executionId: 'exec-1',
              nodeResults: [],
              status: 'completed',
            },
          }),
        );

        await actionHandler('confirm:run')({
          ack,
          body: { user: { id: USER_ID } },
          respond,
        });
        await flush();

        expect(httpService.post).toHaveBeenCalledWith(
          expect.any(String),
          { inputValues: {}, metadata: undefined, workflowId: 'wf-1' },
          expect.any(Object),
        );
        expect(respond).toHaveBeenCalledWith({
          text: 'Workflow completed successfully.',
        });
      });

      it('cleans up when execution creation fails', async () => {
        sessions().set(
          USER_ID,
          makeSession({
            state: 'confirming',
            workflowId: 'wf-1',
            workflowName: 'Poster',
          }),
        );
        httpService.post.mockReturnValue(throwError(() => new Error('500')));

        await actionHandler('confirm:run')({
          ack,
          body: { user: { id: USER_ID } },
          respond,
        });

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to execute workflow',
          expect.objectContaining({ message: '500' }),
        );
        expect(respond).toHaveBeenCalledWith({
          text: 'Workflow execution failed. Please try again.\nUse /workflows to start a new run.',
        });
        expect(sessions().has(USER_ID)).toBe(false);
      });

      it('treats a missing execution id as a failure', async () => {
        sessions().set(
          USER_ID,
          makeSession({
            state: 'confirming',
            workflowId: 'wf-1',
            workflowName: 'Poster',
          }),
        );
        httpService.post.mockReturnValue(
          of({ data: { nodeResults: [], status: 'queued' } }),
        );

        await actionHandler('confirm:run')({
          ack,
          body: { user: { id: USER_ID } },
          respond,
        });

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to execute workflow',
          expect.objectContaining({
            message: 'Workflow execution did not return an execution id',
          }),
        );
        expect(sessions().has(USER_ID)).toBe(false);
      });
    });

    describe('confirm:edit', () => {
      it('clears collected inputs and restarts collection', async () => {
        const session = makeSession({
          collectedInputs: new Map([['n1', 'old']]),
          currentInputIndex: 1,
          requiredInputs: [{ inputType: 'text', label: 'Topic', nodeId: 'n1' }],
          state: 'confirming',
        });
        sessions().set(USER_ID, session);

        await actionHandler('confirm:edit')({
          ack,
          body: { user: { id: USER_ID } },
          respond,
        });

        const updated = sessions().get(USER_ID);
        expect(updated?.state).toBe('collecting');
        expect(updated?.currentInputIndex).toBe(0);
        expect(updated?.collectedInputs.size).toBe(0);
        expect(respond).toHaveBeenCalledWith({
          replace_original: true,
          text: "Inputs cleared. Let's start over.",
        });
        expect(respond).toHaveBeenCalledWith({
          text: '*Input (1/1):* Topic\n\nPlease enter a text value.',
        });
      });

      it('does nothing without a session', async () => {
        await actionHandler('confirm:edit')({
          ack,
          body: { user: { id: USER_ID } },
          respond,
        });

        expect(respond).not.toHaveBeenCalled();
      });
    });

    describe('confirm:cancel', () => {
      it('deletes the session and replaces the message', async () => {
        sessions().set(USER_ID, makeSession({ state: 'confirming' }));

        await actionHandler('confirm:cancel')({
          ack,
          body: { user: { id: USER_ID } },
          respond,
        });

        expect(sessions().has(USER_ID)).toBe(false);
        expect(respond).toHaveBeenCalledWith({
          replace_original: true,
          text: 'Cancelled. Use /workflows to start again.',
        });
      });
    });
  });

  describe('promptNextInput without a session', () => {
    it('does nothing', async () => {
      const say = vi.fn();

      await service['promptNextInput'](USER_ID, say);

      expect(say).not.toHaveBeenCalled();
    });
  });

  describe('showConfirmation without a session', () => {
    it('does nothing', async () => {
      const say = vi.fn();

      await service['showConfirmation'](USER_ID, say);

      expect(say).not.toHaveBeenCalled();
    });
  });

  describe('monitorWorkflowExecution', () => {
    it('returns quietly when the session has no execution id', async () => {
      sessions().set(USER_ID, makeSession({ state: 'running' }));

      await service['monitorWorkflowExecution'](ORG_ID, USER_ID, respond);

      expect(respond).not.toHaveBeenCalled();
    });

    it('clears the session silently when the execution was cancelled', async () => {
      sessions().set(
        USER_ID,
        makeSession({ executionId: 'exec-1', state: 'running' }),
      );
      httpService.get.mockReturnValue(
        of({
          data: { executionId: 'exec-1', nodeResults: [], status: 'cancelled' },
        }),
      );

      await service['monitorWorkflowExecution'](ORG_ID, USER_ID, respond);

      expect(sessions().has(USER_ID)).toBe(false);
      expect(respond).not.toHaveBeenCalled();
    });

    it('relays the execution error when the run failed', async () => {
      sessions().set(
        USER_ID,
        makeSession({ executionId: 'exec-1', state: 'running' }),
      );
      httpService.get.mockReturnValue(
        of({
          data: {
            error: 'GPU exploded',
            executionId: 'exec-1',
            nodeResults: [],
            status: 'failed',
          },
        }),
      );

      await service['monitorWorkflowExecution'](ORG_ID, USER_ID, respond);

      expect(respond).toHaveBeenCalledWith({ text: 'GPU exploded' });
      expect(sessions().has(USER_ID)).toBe(false);
    });

    it('falls back to a generic failure message when the run failed without error text', async () => {
      sessions().set(
        USER_ID,
        makeSession({ executionId: 'exec-1', state: 'running' }),
      );
      httpService.get.mockReturnValue(
        of({
          data: { executionId: 'exec-1', nodeResults: [], status: 'failed' },
        }),
      );

      await service['monitorWorkflowExecution'](ORG_ID, USER_ID, respond);

      expect(respond).toHaveBeenCalledWith({
        text: 'Workflow execution failed. Please try again.\nUse /workflows to start a new run.',
      });
    });

    it('tells the user the workflow is still running when polling times out', async () => {
      vi.useFakeTimers();
      try {
        sessions().set(
          USER_ID,
          makeSession({ executionId: 'exec-1', state: 'running' }),
        );
        httpService.get.mockReturnValue(
          of({
            data: { executionId: 'exec-1', nodeResults: [], status: 'running' },
          }),
        );

        const monitoring = service['monitorWorkflowExecution'](
          ORG_ID,
          USER_ID,
          respond,
        );
        await vi.advanceTimersByTimeAsync(301_000);
        await monitoring;

        expect(respond).toHaveBeenCalledWith({
          text: 'Workflow is still running. Use /status to check progress.',
        });
        // Session is kept so /status and /cancel still work
        expect(sessions().has(USER_ID)).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('reports a failure and clears the session on unexpected polling errors', async () => {
      sessions().set(
        USER_ID,
        makeSession({ executionId: 'exec-1', state: 'running' }),
      );
      httpService.get.mockReturnValue(throwError(() => new Error('boom')));

      await service['monitorWorkflowExecution'](ORG_ID, USER_ID, respond);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed while monitoring workflow execution',
        expect.objectContaining({ message: 'boom' }),
      );
      expect(respond).toHaveBeenCalledWith({
        text: 'Workflow execution failed. Please try again.\nUse /workflows to start a new run.',
      });
      expect(sessions().has(USER_ID)).toBe(false);
    });
  });

  describe('fetchActiveIntegrations', () => {
    it('normalizes API payloads into org integrations', async () => {
      httpService.get.mockReturnValue(
        of({
          data: [
            {
              botToken: 'mock-token',
              config: { allowedUserIds: [USER_ID] },
              id: 'integration-1',
              organizationId: ORG_ID,
              status: 'ACTIVE',
            },
            { id: 'broken' },
          ],
        }),
      );

      const integrations = await service.fetchActiveIntegrations();

      expect(httpService.get).toHaveBeenCalledWith(
        `${API_URL}/v1/internal/integrations/SLACK`,
        { headers: { Authorization: 'Bearer test-key' } },
      );
      expect(integrations).toHaveLength(1);
      expect(integrations[0]).toMatchObject({
        id: 'integration-1',
        orgId: ORG_ID,
        platform: 'SLACK',
      });
    });

    it('warns and returns [] when the API is unreachable', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('connect ECONNREFUSED 127.0.0.1:3010')),
      );

      const integrations = await service.fetchActiveIntegrations();

      expect(integrations).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        `API unavailable at ${API_URL} — starting with 0 bots. Start the API service first.`,
      );
    });

    it('warns about a missing API key on 401', async () => {
      const unauthorized = Object.assign(new Error('Request failed'), {
        response: { status: 401 },
      });
      httpService.get.mockReturnValue(throwError(() => unauthorized));

      const integrations = await service.fetchActiveIntegrations();

      expect(integrations).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        'API returned 401 — set GENFEEDAI_API_KEY in your .env to authenticate with the API.',
      );
    });

    it('logs unexpected errors', async () => {
      httpService.get.mockReturnValue(throwError(() => new Error('kaput')));

      const integrations = await service.fetchActiveIntegrations();

      expect(integrations).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch integrations',
        expect.objectContaining({ message: 'kaput' }),
      );
    });
  });

  describe('initialize', () => {
    it('logs and swallows startup failures', async () => {
      redisService.subscribe.mockRejectedValue(new Error('redis down'));

      await expect(service.initialize()).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to initialize Slack Bot Manager',
        expect.objectContaining({ message: 'redis down' }),
      );
    });
  });

  describe('Redis integration events', () => {
    let handlers: Map<string, (data: unknown) => void>;

    beforeEach(async () => {
      handlers = new Map();
      redisService.subscribe.mockImplementation(
        (channel: string, handler: (data: unknown) => void) => {
          handlers.set(channel, handler);
          return Promise.resolve();
        },
      );
      httpService.get.mockReturnValue(of({ data: [] }));
      await service.initialize();
    });

    it('ignores payloads that are not integration events', async () => {
      const spy = vi.spyOn(service, 'handleRedisEvent');

      handlers.get(REDIS_EVENTS.INTEGRATION_CREATED)?.('not-an-object');
      handlers.get(REDIS_EVENTS.INTEGRATION_CREATED)?.({ platform: 'SLACK' });
      handlers.get(REDIS_EVENTS.INTEGRATION_CREATED)?.(null);
      await flush();

      expect(spy).not.toHaveBeenCalled();
    });

    it('ignores events for other platforms', async () => {
      const spy = vi.spyOn(service, 'handleRedisEvent');

      handlers.get(REDIS_EVENTS.INTEGRATION_CREATED)?.({
        integrationId: 'integration-1',
        platform: 'DISCORD',
      });
      await flush();

      expect(spy).not.toHaveBeenCalled();
    });

    it('dispatches Slack events to handleRedisEvent', async () => {
      const spy = vi
        .spyOn(service, 'handleRedisEvent')
        .mockResolvedValue(undefined);

      handlers.get(REDIS_EVENTS.INTEGRATION_UPDATED)?.({
        integrationId: 'integration-1',
        platform: 'SLACK',
      });
      await flush();

      expect(spy).toHaveBeenCalledWith(REDIS_EVENTS.INTEGRATION_UPDATED, {
        integrationId: 'integration-1',
        platform: 'SLACK',
      });
    });

    it('logs when event handling rejects', async () => {
      vi.spyOn(service, 'handleRedisEvent').mockRejectedValue(
        new Error('handler blew up'),
      );

      handlers.get(REDIS_EVENTS.INTEGRATION_DELETED)?.({
        integrationId: 'integration-1',
        platform: 'SLACK',
      });
      await flush();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to handle Redis integration event',
        expect.objectContaining({ message: 'handler blew up' }),
      );
    });
  });

  describe('fetchAndUpdateIntegration', () => {
    it('warns when the payload cannot be normalized', async () => {
      httpService.get.mockReturnValue(of({ data: { id: 'missing-fields' } }));

      await service['fetchAndUpdateIntegration']('integration-1');

      expect(logger.warn).toHaveBeenCalledWith(
        'Unable to normalize Slack integration payload: integration-1',
      );
    });
  });

  describe('fetchAndAddIntegration', () => {
    it('warns when the payload cannot be normalized', async () => {
      httpService.get.mockReturnValue(of({ data: { id: 'missing-fields' } }));

      await service['fetchAndAddIntegration']('integration-1');

      expect(logger.warn).toHaveBeenCalledWith(
        'Unable to normalize Slack integration payload: integration-1',
      );
    });
  });

  describe('createBotInstance access warnings', () => {
    it('warns when the bot is open to all users', async () => {
      await service.createBotInstance(
        makeIntegration({ allowedUserIds: [], isOpenToAllUsers: true }),
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('is configured open to all users'),
      );
    });

    it('does not warn for allowlisted bots', async () => {
      await service.createBotInstance(makeIntegration());

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('sanitizeErrorForLog', () => {
    it('extracts safe fields from axios-shaped errors', () => {
      const error = Object.assign(new Error('Request failed'), {
        code: 'ERR_BAD_REQUEST',
        config: { headers: { Authorization: 'Bearer secret' } },
        response: { status: 403, statusText: 'Forbidden' },
      });

      expect(service['sanitizeErrorForLog'](error)).toEqual({
        code: 'ERR_BAD_REQUEST',
        message: 'Request failed',
        status: 403,
        statusText: 'Forbidden',
      });
    });

    it('extracts fields from plain object errors', () => {
      expect(
        service['sanitizeErrorForLog']({
          code: 'E1',
          message: 'plain failure',
          name: 'CustomError',
          secret: 'do-not-log',
        }),
      ).toEqual({ code: 'E1', message: 'plain failure', name: 'CustomError' });
    });

    it('stringifies primitive errors', () => {
      expect(service['sanitizeErrorForLog']('oops')).toEqual({ raw: 'oops' });
    });
  });

  describe('internal API HTTP adapter', () => {
    interface AdapterAccess {
      http: {
        get<T>(url: string, headers?: Record<string, string>): Promise<T>;
        post<T>(
          url: string,
          body: unknown,
          headers?: Record<string, string>,
        ): Promise<T>;
      };
    }

    it('posts through HttpService with and without headers', async () => {
      httpService.post.mockReturnValue(of({ data: { ok: true } }));
      const adapter = (service['internalApiClient'] as unknown as AdapterAccess)
        .http;

      const withHeaders = await adapter.post<{ ok: boolean }>(
        'http://api/x',
        { a: 1 },
        { Authorization: 'Bearer test-key' },
      );
      const withoutHeaders = await adapter.post<{ ok: boolean }>(
        'http://api/x',
        { a: 1 },
      );

      expect(withHeaders).toEqual({ ok: true });
      expect(withoutHeaders).toEqual({ ok: true });
      expect(httpService.post).toHaveBeenNthCalledWith(
        1,
        'http://api/x',
        { a: 1 },
        { headers: { Authorization: 'Bearer test-key' } },
      );
      expect(httpService.post).toHaveBeenNthCalledWith(
        2,
        'http://api/x',
        { a: 1 },
        undefined,
      );
    });

    it('gets through HttpService with and without headers', async () => {
      httpService.get.mockReturnValue(of({ data: { ok: true } }));
      const adapter = (service['internalApiClient'] as unknown as AdapterAccess)
        .http;

      await adapter.get('http://api/x', { Authorization: 'Bearer test-key' });
      await adapter.get('http://api/x');

      expect(httpService.get).toHaveBeenNthCalledWith(1, 'http://api/x', {
        headers: { Authorization: 'Bearer test-key' },
      });
      expect(httpService.get).toHaveBeenNthCalledWith(
        2,
        'http://api/x',
        undefined,
      );
    });
  });

  describe('getInternalApiHeaders', () => {
    it('omits the Authorization header when no API key is configured', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SlackBotManager,
          { provide: LoggerService, useValue: logger },
          {
            provide: ConfigService,
            useValue: { API_KEY: '', API_URL, get: vi.fn() },
          },
          { provide: HttpService, useValue: httpService },
          { provide: RedisService, useValue: redisService },
        ],
      }).compile();
      const keylessService = module.get<SlackBotManager>(SlackBotManager);

      expect(keylessService['getInternalApiHeaders']()).toBeUndefined();
      expect(service['getInternalApiHeaders']()).toEqual({
        Authorization: 'Bearer test-key',
      });
    });
  });
});
