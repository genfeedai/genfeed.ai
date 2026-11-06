import type { LoggerService } from '@libs/logger/logger.service';
import type { ConfigService } from '@notifications/config/config.service';
import { SlackService } from '@notifications/services/slack/slack.service';

// The Slack workspace as the bot sees it: the token each client was built
// with, and every message that reached a channel.
const slack = vi.hoisted(() => ({
  clientTokens: [] as string[],
  outage: undefined as Error | undefined,
  posted: [] as Record<string, unknown>[],
}));

vi.mock('@slack/web-api', () => ({
  WebClient: class FakeWebClient {
    chat = {
      postMessage: async (message: Record<string, unknown>) => {
        if (slack.outage) {
          throw slack.outage;
        }
        slack.posted.push(message);
        return { ok: true };
      },
    };

    constructor(token: string) {
      slack.clientTokens.push(token);
    }
  },
}));

describe('SlackService', () => {
  let logs: string[];

  const create = (token: string | undefined) =>
    new SlackService(
      {
        get: (key: string) =>
          key === 'SLACK_NOTIFICATION_BOT_TOKEN' ? token : undefined,
      } as unknown as ConfigService,
      {
        error: (message: string) => logs.push(`error: ${message}`),
        log: (message: string) => logs.push(`log: ${message}`),
        warn: (message: string) => logs.push(`warn: ${message}`),
      } as unknown as LoggerService,
    );

  beforeEach(() => {
    logs = [];
    slack.clientTokens = [];
    slack.outage = undefined;
    slack.posted = [];
  });

  describe('initialization', () => {
    it('skips the client and says so when the bot token is not configured', () => {
      create(undefined);

      expect(slack.clientTokens).toEqual([]);
      expect(logs).toEqual([
        'log: Slack notification bot not configured - skipping initialization',
      ]);
    });

    it('builds the Slack client from the bot token when it is present', () => {
      create('test-slack-bot-token');

      expect(slack.clientTokens).toEqual(['test-slack-bot-token']);
      expect(logs).toEqual(['log: Slack notification client initialized']);
    });
  });

  describe('sendMessage', () => {
    it('sends nothing and reports false when the client is not initialized', async () => {
      const service = create(undefined);

      await expect(service.sendMessage('C123', 'hello')).resolves.toBe(false);
      expect(slack.posted).toEqual([]);
      expect(logs.at(-1)).toContain('Client not initialized');
    });

    it('posts the text to the channel', async () => {
      const service = create('test-slack-bot-token');

      await expect(service.sendMessage('C123', 'Test message')).resolves.toBe(
        true,
      );
      expect(slack.posted).toEqual([
        { blocks: undefined, channel: 'C123', text: 'Test message' },
      ]);
    });

    it('includes blocks when provided', async () => {
      const service = create('test-slack-bot-token');
      const blocks = [
        { text: { text: '*bold*', type: 'mrkdwn' }, type: 'section' },
      ] as Parameters<SlackService['sendMessage']>[2];

      await service.sendMessage('C456', 'fallback', blocks);

      expect(slack.posted).toEqual([
        { blocks, channel: 'C456', text: 'fallback' },
      ]);
    });

    it('logs and rethrows when Slack rejects the message', async () => {
      const service = create('test-slack-bot-token');
      slack.outage = new Error('Rate limited');

      await expect(service.sendMessage('C789', 'message')).rejects.toThrow(
        'Rate limited',
      );
      expect(slack.posted).toEqual([]);
      expect(logs.at(-1)).toMatch(/^error: .*Failed to send message to C789$/);
    });
  });
});
