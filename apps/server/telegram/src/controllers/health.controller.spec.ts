import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';

const mockTelegramBotManager = {
  getActiveCount: vi.fn(),
};

vi.mock('@telegram/services/telegram-bot-manager.service', () => ({
  TelegramBotManager: vi.fn().mockImplementation(() => mockTelegramBotManager),
}));

import { TelegramBotManager } from '@telegram/services/telegram-bot-manager.service';

describe('HealthController (Telegram)', () => {
  let controller: HealthController;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: TelegramBotManager, useValue: mockTelegramBotManager },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return status ok', () => {
    mockTelegramBotManager.getActiveCount.mockReturnValue(0);
    const result = controller.getHealth();
    expect(result.status).toBe('ok');
  });

  it('should return service name telegram', () => {
    mockTelegramBotManager.getActiveCount.mockReturnValue(0);
    const result = controller.getHealth();
    expect(result.service).toBe('telegram');
  });

  it('should return active bot count from manager', () => {
    mockTelegramBotManager.getActiveCount.mockReturnValue(3);
    const result = controller.getHealth();
    expect(result.activeBots).toBe(3);
  });

  it('should return zero when no bots active', () => {
    mockTelegramBotManager.getActiveCount.mockReturnValue(0);
    const result = controller.getHealth();
    expect(result.activeBots).toBe(0);
  });

  it('should return a valid ISO timestamp', () => {
    mockTelegramBotManager.getActiveCount.mockReturnValue(0);
    const result = controller.getHealth();
    expect(() => new Date(result.timestamp)).not.toThrow();
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('should call getActiveCount on the bot manager', () => {
    mockTelegramBotManager.getActiveCount.mockReturnValue(4);
    controller.getHealth();
    expect(mockTelegramBotManager.getActiveCount).toHaveBeenCalledOnce();
  });

  it('should return all expected keys', () => {
    mockTelegramBotManager.getActiveCount.mockReturnValue(0);
    const result = controller.getHealth();
    expect(Object.keys(result).sort()).toEqual(
      ['activeBots', 'service', 'status', 'timestamp'].sort(),
    );
  });
});
