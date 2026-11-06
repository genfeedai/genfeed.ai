import type { IAgentCampaignMessage } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import { AgentMessageBusService } from './agent-message-bus.service';

// Redis list indices: negative values count from the end, both ends inclusive.
const slice = (list: string[], start: number, stop: number) => {
  const from = start < 0 ? Math.max(list.length + start, 0) : start;
  const to = stop < 0 ? list.length + stop : stop;
  return list.slice(from, to + 1);
};

class FakeRedis {
  isDown = false;
  isPublisherAvailable = true;
  lists = new Map<string, string[]>();
  subscribers = new Map<string, Array<(message: unknown) => void>>();
  ttls = new Map<string, number>();

  readonly publisher = {
    expire: async (key: string, seconds: number) => {
      this.ttls.set(key, seconds);
      return 1;
    },
    lrange: async (key: string, start: number, stop: number) => {
      this.assertUp();
      return slice(this.lists.get(key) ?? [], start, stop);
    },
    ltrim: async (key: string, start: number, stop: number) => {
      this.lists.set(key, slice(this.lists.get(key) ?? [], start, stop));
      return 'OK';
    },
    rpush: async (key: string, value: string) => {
      this.assertUp();
      const list = [...(this.lists.get(key) ?? []), value];
      this.lists.set(key, list);
      return list.length;
    },
  };

  readonly service = {
    getPublisher: () => (this.isPublisherAvailable ? this.publisher : null),
    publish: async (channel: string, message: unknown) => {
      for (const handler of this.subscribers.get(channel) ?? []) {
        handler(message);
      }
    },
    subscribe: async (channel: string, handler: (message: unknown) => void) => {
      this.subscribers.set(channel, [
        ...(this.subscribers.get(channel) ?? []),
        handler,
      ]);
    },
  };

  private assertUp() {
    if (this.isDown) {
      throw new Error('Redis error');
    }
  }
}

const message = (text: string, campaignId = 'campaign-123') =>
  ({
    agentId: 'agent-1',
    campaignId,
    payload: { text },
    type: 'message',
  }) as unknown as IAgentCampaignMessage;

const historyKey = (campaignId: string) =>
  `campaign:${campaignId}:message_history`;

describe('AgentMessageBusService', () => {
  let logs: string[];
  let redis: FakeRedis;
  let service: AgentMessageBusService;

  const seedHistory = (campaignId: string, count: number) =>
    redis.lists.set(
      historyKey(campaignId),
      Array.from({ length: count }, (_, index) =>
        JSON.stringify(message(`old-${index}`, campaignId)),
      ),
    );

  beforeEach(() => {
    logs = [];
    redis = new FakeRedis();
    service = new AgentMessageBusService(
      {
        error: (text: string) => logs.push(`error: ${text}`),
        log: (text: string) => logs.push(`log: ${text}`),
        warn: (text: string) => logs.push(`warn: ${text}`),
      } as unknown as LoggerService,
      redis.service as unknown as RedisService,
    );
  });

  describe('publish', () => {
    it('stores the message in the campaign history for 24 hours', async () => {
      await service.publish(message('hello'));

      await expect(service.getRecentMessages('campaign-123')).resolves.toEqual([
        message('hello'),
      ]);
      expect(redis.ttls.get(historyKey('campaign-123'))).toBe(86_400);
      expect(logs).toEqual([
        'log: AgentMessageBusService published message to campaign campaign-123',
      ]);
    });

    it('keeps only the latest 50 messages per campaign', async () => {
      seedHistory('campaign-123', 50);

      await service.publish(message('newest'));

      const history = await service.getRecentMessages('campaign-123');
      expect(history).toHaveLength(50);
      expect(history[0]).toEqual(message('old-1'));
      expect(history.at(-1)).toEqual(message('newest'));
    });

    it('delivers the message to real-time subscribers of that campaign only', async () => {
      const received: IAgentCampaignMessage[] = [];
      const elsewhere: IAgentCampaignMessage[] = [];
      await service.subscribe('campaign-123', (inbound) =>
        received.push(inbound),
      );
      await service.subscribe('campaign-other', (inbound) =>
        elsewhere.push(inbound),
      );

      await service.publish(message('hello'));

      expect(received).toEqual([message('hello')]);
      expect(elsewhere).toEqual([]);
    });

    it('skips publish when Redis publisher is unavailable', async () => {
      redis.isPublisherAvailable = false;

      await service.publish(message('hello'));

      expect(redis.lists.size).toBe(0);
      expect(logs).toEqual([
        'warn: AgentMessageBusService Redis not available, skipping message publish',
      ]);
    });

    it('logs instead of throwing when Redis fails', async () => {
      redis.isDown = true;

      await expect(service.publish(message('hello'))).resolves.toBeUndefined();
      expect(logs).toEqual([
        'error: AgentMessageBusService failed to publish message',
      ]);
    });
  });

  describe('subscribe', () => {
    it('logs the subscription', async () => {
      await service.subscribe('campaign-abc', () => undefined);

      expect(logs).toEqual([
        'log: AgentMessageBusService subscribed to campaign campaign-abc',
      ]);
    });

    it('contains a handler failure instead of breaking the channel', async () => {
      const received: IAgentCampaignMessage[] = [];
      await service.subscribe('campaign-123', () => {
        throw new Error('handler bug');
      });
      await service.subscribe('campaign-123', (inbound) =>
        received.push(inbound),
      );

      await service.publish(message('hello'));

      expect(received).toEqual([message('hello')]);
      expect(logs).toContain(
        'error: AgentMessageBusService failed to handle message from campaign campaign-123',
      );
    });
  });

  describe('getRecentMessages', () => {
    it('returns empty array when Redis publisher is unavailable', async () => {
      seedHistory('campaign-123', 2);
      redis.isPublisherAvailable = false;

      await expect(service.getRecentMessages('campaign-123')).resolves.toEqual(
        [],
      );
      expect(logs).toEqual([
        'warn: AgentMessageBusService Redis not available, returning empty messages',
      ]);
    });

    it('returns the last messages up to a custom limit', async () => {
      seedHistory('campaign-123', 12);

      const history = await service.getRecentMessages('campaign-123', 10);

      expect(history).toHaveLength(10);
      expect(history[0]).toEqual(message('old-2'));
      expect(history.at(-1)).toEqual(message('old-11'));
    });

    it('returns empty array and logs error when Redis fails', async () => {
      seedHistory('campaign-123', 2);
      redis.isDown = true;

      await expect(service.getRecentMessages('campaign-123')).resolves.toEqual(
        [],
      );
      expect(logs).toEqual([
        'error: AgentMessageBusService failed to get recent messages for campaign campaign-123',
      ]);
    });
  });
});
