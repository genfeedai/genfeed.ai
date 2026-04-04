import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { AgentMessageBusService } from './agent-message-bus.service';

const makePublisher = () => ({
  expire: vi.fn().mockResolvedValue(1),
  lRange: vi.fn().mockResolvedValue([]),
  lTrim: vi.fn().mockResolvedValue('OK'),
  rPush: vi.fn().mockResolvedValue(1),
});

describe('AgentMessageBusService', () => {
  let service: AgentMessageBusService;
  let redisService: vi.Mocked<RedisService>;
  let loggerService: vi.Mocked<LoggerService>;
  let publisher: ReturnType<typeof makePublisher>;

  beforeEach(async () => {
    publisher = makePublisher();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentMessageBusService,
        {
          provide: RedisService,
          useValue: {
            getPublisher: vi.fn().mockReturnValue(publisher),
            publish: vi.fn().mockResolvedValue(undefined),
            subscribe: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(AgentMessageBusService);
    redisService = module.get(RedisService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── publish ───────────────────────────────────────────────────────────────

  describe('publish', () => {
    const message = {
      agentId: 'agent-1',
      campaignId: 'campaign-123',
      payload: { text: 'hello' },
      type: 'message',
    } as never;

    it('publishes message to Redis list and pub/sub channel', async () => {
      await service.publish(message);

      expect(publisher.rPush).toHaveBeenCalledWith(
        'campaign:campaign-123:message_history',
        JSON.stringify(message),
      );
      expect(publisher.lTrim).toHaveBeenCalledWith(
        'campaign:campaign-123:message_history',
        -50,
        -1,
      );
      expect(publisher.expire).toHaveBeenCalledWith(
        'campaign:campaign-123:message_history',
        86400,
      );
      expect(redisService.publish).toHaveBeenCalledWith(
        'campaign:campaign-123:messages',
        message,
      );
    });

    it('logs after successful publish', async () => {
      await service.publish(message);
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('published message'),
        expect.objectContaining({ agentId: 'agent-1' }),
      );
    });

    it('skips publish when Redis publisher is unavailable', async () => {
      redisService.getPublisher.mockReturnValue(null as never);
      await service.publish(message);

      expect(publisher.rPush).not.toHaveBeenCalled();
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('Redis not available'),
        expect.any(Object),
      );
    });

    it('logs error when rPush throws', async () => {
      publisher.rPush.mockRejectedValue(new Error('Redis error'));
      await service.publish(message);
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ── subscribe ─────────────────────────────────────────────────────────────

  describe('subscribe', () => {
    it('subscribes to campaign channel', async () => {
      const handler = vi.fn();
      await service.subscribe('campaign-abc', handler);

      expect(redisService.subscribe).toHaveBeenCalledWith(
        'campaign:campaign-abc:messages',
        expect.any(Function),
      );
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('subscribed'),
      );
    });

    it('calls handler with deserialized message on channel event', async () => {
      const handler = vi.fn();
      let capturedCallback: ((msg: unknown) => void) | null = null;

      redisService.subscribe.mockImplementation((_channel, cb) => {
        capturedCallback = cb as (msg: unknown) => void;
        return Promise.resolve();
      });

      await service.subscribe('campaign-xyz', handler);

      const inbound = { campaignId: 'campaign-xyz', type: 'update' };
      capturedCallback!(inbound);

      expect(handler).toHaveBeenCalledWith(inbound);
    });
  });

  // ── getRecentMessages ─────────────────────────────────────────────────────

  describe('getRecentMessages', () => {
    it('returns empty array when Redis publisher is unavailable', async () => {
      redisService.getPublisher.mockReturnValue(null as never);
      const result = await service.getRecentMessages('campaign-123');
      expect(result).toEqual([]);
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('returns parsed messages from Redis list', async () => {
      const msgs = [
        { campaignId: 'campaign-123', type: 'msg' },
        { campaignId: 'campaign-123', type: 'msg2' },
      ];
      publisher.lRange.mockResolvedValue(msgs.map((m) => JSON.stringify(m)));

      const result = await service.getRecentMessages('campaign-123');
      expect(result).toEqual(msgs);
      expect(publisher.lRange).toHaveBeenCalledWith(
        'campaign:campaign-123:message_history',
        -50,
        -1,
      );
    });

    it('respects custom limit', async () => {
      publisher.lRange.mockResolvedValue([]);
      await service.getRecentMessages('campaign-123', 10);
      expect(publisher.lRange).toHaveBeenCalledWith(
        'campaign:campaign-123:message_history',
        -10,
        -1,
      );
    });

    it('returns empty array and logs error when lRange throws', async () => {
      publisher.lRange.mockRejectedValue(new Error('Redis error'));
      const result = await service.getRecentMessages('campaign-123');
      expect(result).toEqual([]);
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
