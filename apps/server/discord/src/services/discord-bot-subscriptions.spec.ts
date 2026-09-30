import { DiscordBotSubscriptions } from '@discord/services/discord-bot-subscriptions';
import { REDIS_EVENTS } from '@genfeedai/integrations';
import type { RedisService } from '@libs/redis/redis.service';

type RedisHandler = (data: unknown) => void;

interface SubscriptionTestContext {
  handlers: Map<string, RedisHandler>;
  handleIntegrationEvent: ReturnType<typeof vi.fn>;
  logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  redis: {
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
  };
  sendToChannel: ReturnType<typeof vi.fn>;
  subscriptions: DiscordBotSubscriptions;
}

function createContext(): SubscriptionTestContext {
  const handlers = new Map<string, RedisHandler>();
  const redis = {
    subscribe: vi
      .fn()
      .mockImplementation(async (event: string, handler: RedisHandler) => {
        handlers.set(event, handler);
      }),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const handleIntegrationEvent = vi.fn().mockResolvedValue(undefined);
  const sendToChannel = vi.fn().mockResolvedValue(null);

  const subscriptions = new DiscordBotSubscriptions(
    redis as unknown as RedisService,
    logger,
    { handleIntegrationEvent, sendToChannel },
  );

  return {
    handleIntegrationEvent,
    handlers,
    logger,
    redis,
    sendToChannel,
    subscriptions,
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('DiscordBotSubscriptions', () => {
  describe('subscribe', () => {
    it('should subscribe to the three integration events and the channel event', async () => {
      const ctx = createContext();

      await ctx.subscriptions.subscribe();

      expect(ctx.redis.subscribe).toHaveBeenCalledTimes(4);
      expect(ctx.handlers.has(REDIS_EVENTS.INTEGRATION_CREATED)).toBe(true);
      expect(ctx.handlers.has(REDIS_EVENTS.INTEGRATION_UPDATED)).toBe(true);
      expect(ctx.handlers.has(REDIS_EVENTS.INTEGRATION_DELETED)).toBe(true);
      expect(ctx.handlers.has(REDIS_EVENTS.DISCORD_SEND_TO_CHANNEL)).toBe(true);
    });

    it('should not resubscribe when called twice', async () => {
      const ctx = createContext();

      await ctx.subscriptions.subscribe();
      await ctx.subscriptions.subscribe();

      expect(ctx.redis.subscribe).toHaveBeenCalledTimes(4);
    });
  });

  describe('integration event handling', () => {
    it('should dispatch valid Discord integration events', async () => {
      const ctx = createContext();
      await ctx.subscriptions.subscribe();

      ctx.handlers.get(REDIS_EVENTS.INTEGRATION_CREATED)?.({
        integrationId: 'int-1',
        platform: 'DISCORD',
      });
      await flushMicrotasks();

      expect(ctx.handleIntegrationEvent).toHaveBeenCalledWith(
        REDIS_EVENTS.INTEGRATION_CREATED,
        { integrationId: 'int-1', platform: 'DISCORD' },
      );
    });

    it('should ignore events for other platforms', async () => {
      const ctx = createContext();
      await ctx.subscriptions.subscribe();

      ctx.handlers.get(REDIS_EVENTS.INTEGRATION_UPDATED)?.({
        integrationId: 'int-1',
        platform: 'SLACK',
      });
      await flushMicrotasks();

      expect(ctx.handleIntegrationEvent).not.toHaveBeenCalled();
    });

    it('should ignore malformed integration payloads', async () => {
      const ctx = createContext();
      await ctx.subscriptions.subscribe();

      const handler = ctx.handlers.get(REDIS_EVENTS.INTEGRATION_DELETED);
      handler?.(null);
      handler?.('not-an-object');
      handler?.({ platform: 'DISCORD' });
      handler?.({ integrationId: 42, platform: 'DISCORD' });
      await flushMicrotasks();

      expect(ctx.handleIntegrationEvent).not.toHaveBeenCalled();
    });

    it('should log when the integration handler rejects', async () => {
      const ctx = createContext();
      const error = new Error('handler failed');
      ctx.handleIntegrationEvent.mockRejectedValue(error);
      await ctx.subscriptions.subscribe();

      ctx.handlers.get(REDIS_EVENTS.INTEGRATION_CREATED)?.({
        integrationId: 'int-1',
        platform: 'DISCORD',
      });
      await flushMicrotasks();

      expect(ctx.logger.error).toHaveBeenCalledWith(
        'Failed to handle Redis integration event',
        error,
      );
    });
  });

  describe('send-to-channel event handling', () => {
    it('should dispatch valid send-to-channel events', async () => {
      const ctx = createContext();
      await ctx.subscriptions.subscribe();

      ctx.handlers.get(REDIS_EVENTS.DISCORD_SEND_TO_CHANNEL)?.({
        channelId: 'ch-1',
        message: 'hello',
        orgId: 'org-1',
      });
      await flushMicrotasks();

      expect(ctx.sendToChannel).toHaveBeenCalledWith('org-1', 'ch-1', 'hello');
    });

    it('should ignore malformed send-to-channel payloads', async () => {
      const ctx = createContext();
      await ctx.subscriptions.subscribe();

      const handler = ctx.handlers.get(REDIS_EVENTS.DISCORD_SEND_TO_CHANNEL);
      handler?.(null);
      handler?.({ channelId: 'ch-1', orgId: 'org-1' });
      handler?.({ channelId: 'ch-1', message: 7, orgId: 'org-1' });
      await flushMicrotasks();

      expect(ctx.sendToChannel).not.toHaveBeenCalled();
    });

    it('should log when sending to the channel rejects', async () => {
      const ctx = createContext();
      const error = new Error('send failed');
      ctx.sendToChannel.mockRejectedValue(error);
      await ctx.subscriptions.subscribe();

      ctx.handlers.get(REDIS_EVENTS.DISCORD_SEND_TO_CHANNEL)?.({
        channelId: 'ch-1',
        message: 'hello',
        orgId: 'org-1',
      });
      await flushMicrotasks();

      expect(ctx.logger.error).toHaveBeenCalledWith(
        'Failed to handle discord:send-to-channel event',
        error,
      );
    });
  });

  describe('unsubscribe', () => {
    it('should be a no-op before subscribing', async () => {
      const ctx = createContext();

      await ctx.subscriptions.unsubscribe();

      expect(ctx.redis.unsubscribe).not.toHaveBeenCalled();
    });

    it('should unsubscribe from the integration events', async () => {
      const ctx = createContext();
      await ctx.subscriptions.subscribe();

      await ctx.subscriptions.unsubscribe();

      expect(ctx.redis.unsubscribe).toHaveBeenCalledTimes(3);
      expect(ctx.redis.unsubscribe).toHaveBeenCalledWith(
        REDIS_EVENTS.INTEGRATION_CREATED,
      );
      expect(ctx.logger.warn).not.toHaveBeenCalled();
    });

    it('should warn when an unsubscribe rejects but continue', async () => {
      const ctx = createContext();
      const error = new Error('redis gone');
      ctx.redis.unsubscribe.mockRejectedValueOnce(error);
      await ctx.subscriptions.subscribe();

      await ctx.subscriptions.unsubscribe();

      expect(ctx.logger.warn).toHaveBeenCalledWith(
        'Failed to unsubscribe from one or more Redis channels',
        error,
      );
    });
  });
});
