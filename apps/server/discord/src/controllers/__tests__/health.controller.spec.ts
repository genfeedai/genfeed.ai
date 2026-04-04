import { HealthController } from '@discord/controllers/health.controller';
import { DiscordBotManager } from '@discord/services/discord-bot-manager.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('Discord HealthController', () => {
  let controller: HealthController;
  let discordBotManager: Mocked<DiscordBotManager>;

  beforeEach(async () => {
    const mockDiscordBotManager = {
      addIntegration: vi.fn(),
      getActiveCount: vi.fn(),
      initialize: vi.fn(),
      removeIntegration: vi.fn(),
      shutdown: vi.fn(),
      updateIntegration: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DiscordBotManager,
          useValue: mockDiscordBotManager,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    discordBotManager = module.get(DiscordBotManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getHealth', () => {
    it('should return health status with active bots', () => {
      discordBotManager.getActiveCount.mockReturnValue(2);

      const result = controller.getHealth();

      expect(result).toEqual({
        activeBots: 2,
        service: 'discord',
        status: 'ok',
        timestamp: expect.any(String),
      });

      expect(discordBotManager.getActiveCount).toHaveBeenCalled();
    });

    it('should return health status with no active bots', () => {
      discordBotManager.getActiveCount.mockReturnValue(0);

      const result = controller.getHealth();

      expect(result).toEqual({
        activeBots: 0,
        service: 'discord',
        status: 'ok',
        timestamp: expect.any(String),
      });
    });

    it('should return valid ISO timestamp', () => {
      discordBotManager.getActiveCount.mockReturnValue(1);

      const result = controller.getHealth();
      const timestamp = new Date(result.timestamp);

      expect(timestamp.getTime()).toBeGreaterThan(Date.now() - 1000);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should handle manager errors', () => {
      discordBotManager.getActiveCount.mockImplementation(() => {
        throw new Error('Discord manager error');
      });

      expect(() => controller.getHealth()).toThrow('Discord manager error');
    });
  });
});
