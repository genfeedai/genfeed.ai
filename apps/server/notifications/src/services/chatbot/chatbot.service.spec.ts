import type { LoggerService } from '@libs/logger/logger.service';
import type { ConfigService } from '@notifications/config/config.service';
import { ChatBotService } from '@notifications/services/chatbot/chatbot.service';
import type { GenFeedService } from '@notifications/services/genfeed/genfeed.service';

// Outbound chat requests, as the platforms receive them.
const network = vi.hoisted(() => ({
  failure: null as Error | null,
  requests: [] as Array<{
    body: unknown;
    headers: Record<string, string>;
    url: string;
  }>,
}));

vi.mock('axios', () => ({
  default: {
    post: async (
      url: string,
      body: unknown,
      config: { headers: Record<string, string> },
    ) => {
      if (network.failure) throw network.failure;
      network.requests.push({ body, headers: config.headers, url });
      return { data: {} };
    },
  },
}));

describe('ChatBotService', () => {
  let prompts: unknown[];
  let isGenerationDown: boolean;
  let service: ChatBotService;

  beforeEach(() => {
    network.failure = null;
    network.requests.length = 0;
    prompts = [];
    isGenerationDown = false;

    service = new ChatBotService(
      {
        get: (key: string) =>
          key === 'TWITCH_CLIENT_ID' ? 'client' : undefined,
      } as unknown as ConfigService,
      { error: () => {}, log: () => {} } as unknown as LoggerService,
      {
        generateResponse: async (request: { prompt: string }) => {
          if (isGenerationDown) throw new Error('api down');
          prompts.push(request);
          return `reply to ${request.prompt}`;
        },
      } as unknown as GenFeedService,
    );
  });

  it('generates a chat response', async () => {
    await expect(service.generateResponse('hello')).resolves.toBe(
      'reply to hello',
    );
    expect(prompts).toEqual([{ prompt: 'hello', type: 'chat' }]);
  });

  it('rethrows generation failures', async () => {
    isGenerationDown = true;

    await expect(service.generateResponse('hello')).rejects.toThrow('api down');
  });

  it.each([
    [undefined, 'broadcaster-1'],
    ['bot-7', 'bot-7'],
  ])(
    'posts to Twitch helix with sender %s resolved to %s',
    async (senderId, expectedSender) => {
      await service.sendToTwitchChat('tok', 'broadcaster-1', 'gm', senderId);

      expect(network.requests).toEqual([
        {
          body: { message: 'gm' },
          headers: {
            Authorization: 'Bearer tok',
            'Client-Id': 'client',
            'Content-Type': 'application/json',
          },
          url: `https://api.twitch.tv/helix/chat/messages?broadcaster_id=broadcaster-1&sender_id=${expectedSender}`,
        },
      ]);
    },
  );

  it('posts to the YouTube live chat API', async () => {
    await service.sendToYouTubeChat('tok', 'live-1', 'gm');

    expect(network.requests).toEqual([
      {
        body: {
          snippet: {
            liveChatId: 'live-1',
            textMessageDetails: { messageText: 'gm' },
            type: 'textMessageEvent',
          },
        },
        headers: { Authorization: 'Bearer tok' },
        url: 'https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet',
      },
    ]);
  });

  it.each([
    ['Twitch', () => service.sendToTwitchChat('tok', 'b-1', 'gm')],
    ['YouTube', () => service.sendToYouTubeChat('tok', 'live-1', 'gm')],
  ])('rethrows %s API failures', async (_platform, send) => {
    network.failure = new Error('rate limited');

    await expect(send()).rejects.toThrow('rate limited');
  });

  it.each([
    [
      'twitch' as const,
      'https://api.twitch.tv/helix/chat/messages?broadcaster_id=chan-1&sender_id=chan-1',
    ],
    [
      'youtube' as const,
      'https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet',
    ],
  ])('answers a %s chat on that platform', async (platform, url) => {
    await service.handleChat(platform, 'tok', 'chan-1', 'hello');

    expect(network.requests).toEqual([expect.objectContaining({ url })]);
    expect(JSON.stringify(network.requests[0]?.body)).toContain(
      'reply to hello',
    );
  });
});
