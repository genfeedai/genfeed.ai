import { ConfigService } from '@files/config/config.service';
import { WebSocketService } from '@files/services/websocket/websocket.service';
import { Test, type TestingModule } from '@nestjs/testing';

const { publishMock } = vi.hoisted(() => ({ publishMock: vi.fn() }));

// Mock Redis client
vi.mock('ioredis', () => ({
  default: vi.fn(function RedisMock() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
      on: vi.fn(),
      publish: publishMock,
      status: 'ready',
    };
  }),
}));

function publishedMessage(): { channel: unknown; message: unknown } {
  const [channel, payload] = publishMock.mock.calls[0] ?? [];
  return { channel, message: JSON.parse(String(payload)) };
}

describe('WebSocketService (Files)', () => {
  let service: WebSocketService;

  const mockConfigService = {
    get: vi.fn().mockReturnValue('redis://localhost:6379'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebSocketService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<WebSocketService>(WebSocketService);
    module.get<ConfigService>(ConfigService);

    // Wait for Redis initialization
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize with Redis URL from config', () => {
    expect(mockConfigService.get).toHaveBeenCalledWith('REDIS_URL');
  });

  describe('emitProgress', () => {
    it('publishes the progress to the user room', async () => {
      const websocketUrl = '/ws/progress/user-123';
      const progress = { message: 'Processing', percent: 50 };

      await service.emitProgress(websocketUrl, progress, 'user-123');

      expect(publishedMessage()).toEqual({
        channel: 'video-progress',
        message: {
          path: websocketUrl,
          progress,
          room: 'user:user-123',
          userId: 'user-123',
        },
      });
    });

    it('falls back to the path as user id when no user is given', async () => {
      const websocketUrl = '/ws/progress';
      const progress = { message: 'Almost done', percent: 75 };

      await service.emitProgress(websocketUrl, progress);

      expect(publishedMessage()).toEqual({
        channel: 'video-progress',
        message: { path: websocketUrl, progress, userId: websocketUrl },
      });
    });
  });
});
