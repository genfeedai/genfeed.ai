import { EventsService } from '@libs/events/events.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('EventsService', () => {
  let service: EventsService;
  let loggerService: Mocked<LoggerService>;
  let redisService: Mocked<RedisService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            publish: vi.fn(),
            subscribe: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    loggerService = module.get(LoggerService);
    redisService = module.get(RedisService);

    // Reset all mocks
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should log initialization message', () => {
      service.onModuleInit();

      expect(loggerService.log).toHaveBeenCalledWith(
        'EventsService initialized - ready for event publishing',
        { service: 'EventsService' },
      );
    });
  });

  describe('emitToApi', () => {
    it('should publish events to API channel', async () => {
      const channel = 'test-channel';
      const data = { test: 'data' };

      await service.emitToApi(channel, data);

      expect(redisService.publish).toHaveBeenCalledWith(`api:${channel}`, data);
    });
  });

  describe('emit', () => {
    it('should publish events to specified channel', async () => {
      const channel = 'test-channel';
      const data = { test: 'data' };

      await service.emit(channel, data);

      expect(redisService.publish).toHaveBeenCalledWith(channel, data);
    });
  });
});
