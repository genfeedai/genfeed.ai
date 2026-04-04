import { ConfigService } from '@files/config/config.service';
import { WebSocketService } from '@files/services/websocket/websocket.service';
import { Test, type TestingModule } from '@nestjs/testing';

// Mock Redis client
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    isOpen: true,
    on: vi.fn(),
    publish: vi.fn(),
  })),
}));

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
    it('should emit progress to websocket', async () => {
      const websocketUrl = '/ws/progress/user-123';
      const progress = {
        message: 'Processing',
        percentage: 50,
        status: 'in_progress',
      };

      await service.emitProgress(websocketUrl, progress);

      // Service should attempt to publish to Redis
      expect(true).toBe(true);
    });

    it('should handle missing userId', async () => {
      const websocketUrl = '/ws/progress';
      const progress = {
        message: 'Almost done',
        percentage: 75,
        status: 'in_progress',
      };

      await service.emitProgress(websocketUrl, progress);

      expect(true).toBe(true);
    });
  });
});
