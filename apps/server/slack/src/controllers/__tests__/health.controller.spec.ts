import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '@slack/controllers/health.controller';
import { SlackBotManager } from '@slack/services/slack-bot-manager.service';
import type { Mocked } from 'vitest';

describe('Slack HealthController', () => {
  let controller: HealthController;
  let slackBotManager: Mocked<SlackBotManager>;

  beforeEach(async () => {
    const mockSlackBotManager = {
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
          provide: SlackBotManager,
          useValue: mockSlackBotManager,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    slackBotManager = module.get(SlackBotManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getHealth', () => {
    it('should return health status with active bots', () => {
      slackBotManager.getActiveCount.mockReturnValue(3);

      const result = controller.getHealth();

      expect(result).toEqual({
        activeBots: 3,
        service: 'slack',
        status: 'ok',
        timestamp: expect.any(String),
      });

      expect(slackBotManager.getActiveCount).toHaveBeenCalled();
    });

    it('should return health status with no active bots', () => {
      slackBotManager.getActiveCount.mockReturnValue(0);

      const result = controller.getHealth();

      expect(result).toEqual({
        activeBots: 0,
        service: 'slack',
        status: 'ok',
        timestamp: expect.any(String),
      });
    });

    it('should return valid ISO timestamp', () => {
      slackBotManager.getActiveCount.mockReturnValue(1);

      const result = controller.getHealth();
      const timestamp = new Date(result.timestamp);

      expect(timestamp.getTime()).toBeGreaterThan(Date.now() - 1000);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should handle manager errors', () => {
      slackBotManager.getActiveCount.mockImplementation(() => {
        throw new Error('Slack manager error');
      });

      expect(() => controller.getHealth()).toThrow('Slack manager error');
    });
  });
});
