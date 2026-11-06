import { DiscordBotSubscriptions } from '@discord/services/discord-bot-subscriptions';
import { REDIS_EVENTS } from '@genfeedai/integrations';
import type { RedisService } from '@libs/redis/redis.service';
import { beforeEach, describe, expect, it } from 'vitest';

type RedisHandler = (data: unknown) => void;

interface Logged {
  level: 'error' | 'log' | 'warn';
  message: unknown;
}

const INTEGRATION_EVENTS = [
  REDIS_EVENTS.INTEGRATION_CREATED,
  REDIS_EVENTS.INTEGRATION_UPDATED,
  REDIS_EVENTS.INTEGRATION_DELETED,
];

// The handlers run detached from the Redis callback; let them finish.
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('DiscordBotSubscriptions', () => {
  let channels: Map<string, RedisHandler[]>;
  let brokenChannels: Set<string>;
  let integrationEvents: [string, unknown][];
  let sentMessages: [string, string, string][];
  let isBotFailing: boolean;
  let logged: Logged[];
  let subscriptions: DiscordBotSubscriptions;

  const publish = async (event: string, data: unknown) => {
    for (const handler of channels.get(event) ?? []) {
      handler(data);
    }
    await settle();
  };
  const messagesAt = (level: Logged['level']) =>
    logged.filter((entry) => entry.level === level).map((e) => e.message);

  beforeEach(() => {
    channels = new Map();
    brokenChannels = new Set();
    integrationEvents = [];
    sentMessages = [];
    isBotFailing = false;
    logged = [];

    // Redis pub/sub: one handler list per channel.
    const redis = {
      subscribe: async (event: string, handler: RedisHandler) => {
        channels.set(event, [...(channels.get(event) ?? []), handler]);
      },
      unsubscribe: async (event: string) => {
        if (brokenChannels.has(event)) throw new Error('redis gone');
        channels.delete(event);
      },
    } as unknown as RedisService;
    const record = (level: Logged['level']) => (message: unknown) => {
      logged.push({ level, message });
    };

    subscriptions = new DiscordBotSubscriptions(
      redis,
      { error: record('error'), log: record('log'), warn: record('warn') },
      {
        handleIntegrationEvent: async (event: string, data: unknown) => {
          if (isBotFailing) throw new Error('handler failed');
          integrationEvents.push([event, data]);
        },
        sendToChannel: async (
          orgId: string,
          channelId: string,
          message: string,
        ) => {
          if (isBotFailing) throw new Error('send failed');
          sentMessages.push([orgId, channelId, message]);
        },
      },
    );
  });

  it('listens once on the integration and send-to-channel events', async () => {
    await subscriptions.subscribe();
    await subscriptions.subscribe();

    expect(
      [...channels.entries()].map(([event, handlers]) => [
        event,
        handlers.length,
      ]),
    ).toEqual([
      [REDIS_EVENTS.INTEGRATION_CREATED, 1],
      [REDIS_EVENTS.INTEGRATION_UPDATED, 1],
      [REDIS_EVENTS.INTEGRATION_DELETED, 1],
      [REDIS_EVENTS.DISCORD_SEND_TO_CHANNEL, 1],
    ]);
  });

  it.each(INTEGRATION_EVENTS)(
    'hands a Discord integration %s event to the bot',
    async (event) => {
      await subscriptions.subscribe();

      await publish(event, { integrationId: 'int-1', platform: 'DISCORD' });

      expect(integrationEvents).toEqual([
        [event, { integrationId: 'int-1', platform: 'DISCORD' }],
      ]);
    },
  );

  it.each([
    ['another platform', { integrationId: 'int-1', platform: 'SLACK' }],
    ['no payload', null],
    ['a string payload', 'not-an-object'],
    ['no integration id', { platform: 'DISCORD' }],
    ['a numeric integration id', { integrationId: 42, platform: 'DISCORD' }],
  ])('ignores an integration event with %s', async (_case, data) => {
    await subscriptions.subscribe();

    await publish(REDIS_EVENTS.INTEGRATION_UPDATED, data);

    expect(integrationEvents).toEqual([]);
  });

  it('sends a channel message for a send-to-channel event', async () => {
    await subscriptions.subscribe();

    await publish(REDIS_EVENTS.DISCORD_SEND_TO_CHANNEL, {
      channelId: 'ch-1',
      message: 'hello',
      orgId: 'org-1',
    });

    expect(sentMessages).toEqual([['org-1', 'ch-1', 'hello']]);
  });

  it.each([
    ['no payload', null],
    ['no message', { channelId: 'ch-1', orgId: 'org-1' }],
    ['a numeric message', { channelId: 'ch-1', message: 7, orgId: 'org-1' }],
  ])('ignores a send-to-channel event with %s', async (_case, data) => {
    await subscriptions.subscribe();

    await publish(REDIS_EVENTS.DISCORD_SEND_TO_CHANNEL, data);

    expect(sentMessages).toEqual([]);
  });

  it.each([
    [
      REDIS_EVENTS.INTEGRATION_CREATED,
      { integrationId: 'int-1', platform: 'DISCORD' },
      'Failed to handle Redis integration event',
    ],
    [
      REDIS_EVENTS.DISCORD_SEND_TO_CHANNEL,
      { channelId: 'ch-1', message: 'hello', orgId: 'org-1' },
      'Failed to handle discord:send-to-channel event',
    ],
  ])(
    'logs a bot failure on %s without breaking the listener',
    async (event, data, message) => {
      await subscriptions.subscribe();
      isBotFailing = true;

      await publish(event, data);

      expect(messagesAt('error')).toEqual([message]);
    },
  );

  it('stops listening for integration events but keeps channel sends', async () => {
    await subscriptions.subscribe();

    await subscriptions.unsubscribe();
    await publish(REDIS_EVENTS.INTEGRATION_CREATED, {
      integrationId: 'int-1',
      platform: 'DISCORD',
    });

    expect([...channels.keys()]).toEqual([
      REDIS_EVENTS.DISCORD_SEND_TO_CHANNEL,
    ]);
    expect(integrationEvents).toEqual([]);
    expect(messagesAt('warn')).toEqual([]);
  });

  it('leaves Redis alone when it never subscribed', async () => {
    await subscriptions.unsubscribe();

    expect(channels.size).toBe(0);
    expect(messagesAt('warn')).toEqual([]);
  });

  it('warns about a channel Redis cannot release and still releases the rest', async () => {
    await subscriptions.subscribe();
    brokenChannels.add(REDIS_EVENTS.INTEGRATION_UPDATED);

    await subscriptions.unsubscribe();

    expect([...channels.keys()]).toEqual([
      REDIS_EVENTS.INTEGRATION_UPDATED,
      REDIS_EVENTS.DISCORD_SEND_TO_CHANNEL,
    ]);
    expect(messagesAt('warn')).toEqual([
      'Failed to unsubscribe from one or more Redis channels',
    ]);
  });

  it('listens again after an unsubscribe', async () => {
    await subscriptions.subscribe();
    await subscriptions.unsubscribe();

    await subscriptions.subscribe();
    await publish(REDIS_EVENTS.INTEGRATION_DELETED, {
      integrationId: 'int-1',
      platform: 'DISCORD',
    });

    expect(integrationEvents).toHaveLength(1);
    expect(channels.get(REDIS_EVENTS.DISCORD_SEND_TO_CHANNEL)).toHaveLength(1);
  });
});
