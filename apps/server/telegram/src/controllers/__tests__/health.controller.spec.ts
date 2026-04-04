import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '@telegram/controllers/health.controller';
import { TelegramBotManager } from '@telegram/services/telegram-bot-manager.service';
import type { Mocked } from 'vitest';

describe('Telegram HealthController', () => {
  let controller: HealthController;
  let telegramBotManager: Mocked<TelegramBotManager>;

  beforeEach(async () => {
    const mockTelegramBotManager = {
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
          provide: TelegramBotManager,
          useValue: mockTelegramBotManager,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    telegramBotManager = module.get(TelegramBotManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getHealth', () => {
    it('should return ok status with active bots', () => {
      telegramBotManager.getActiveCount.mockReturnValue(5);

      const result = controller.getHealth();

      expect(result).toEqual({
        activeBots: 5,
        service: 'telegram',
        status: 'ok',
        timestamp: expect.any(String),
      });

      expect(telegramBotManager.getActiveCount).toHaveBeenCalled();
    });

    it('should return ok status with no active bots', () => {
      telegramBotManager.getActiveCount.mockReturnValue(0);

      const result = controller.getHealth();

      expect(result).toEqual({
        activeBots: 0,
        service: 'telegram',
        status: 'ok',
        timestamp: expect.any(String),
      });
    });

    it('should return valid timestamp', () => {
      telegramBotManager.getActiveCount.mockReturnValue(2);

      const result = controller.getHealth();
      const timestamp = new Date(result.timestamp);

      expect(timestamp.getTime()).toBeGreaterThan(Date.now() - 1000);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('error handling', () => {
    it('should handle errors from telegram bot manager gracefully', () => {
      telegramBotManager.getActiveCount.mockImplementation(() => {
        throw new Error('Bot manager error');
      });

      expect(() => controller.getHealth()).toThrow('Bot manager error');
    });
  });
});
