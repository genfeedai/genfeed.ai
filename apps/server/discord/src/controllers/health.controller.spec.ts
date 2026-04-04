import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';

const mockDiscordBotManager = {
  getActiveCount: vi.fn(),
};

vi.mock('@discord/services/discord-bot-manager.service', () => ({
  DiscordBotManager: vi.fn().mockImplementation(() => mockDiscordBotManager),
}));

import { DiscordBotManager } from '@discord/services/discord-bot-manager.service';

describe('HealthController (Discord)', () => {
  let controller: HealthController;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DiscordBotManager, useValue: mockDiscordBotManager },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return status ok', () => {
    mockDiscordBotManager.getActiveCount.mockReturnValue(0);
    const result = controller.getHealth();
    expect(result.status).toBe('ok');
  });

  it('should return service name discord', () => {
    mockDiscordBotManager.getActiveCount.mockReturnValue(0);
    const result = controller.getHealth();
    expect(result.service).toBe('discord');
  });

  it('should return active bot count from manager', () => {
    mockDiscordBotManager.getActiveCount.mockReturnValue(5);
    const result = controller.getHealth();
    expect(result.activeBots).toBe(5);
  });

  it('should return zero when no bots active', () => {
    mockDiscordBotManager.getActiveCount.mockReturnValue(0);
    const result = controller.getHealth();
    expect(result.activeBots).toBe(0);
  });

  it('should return a valid ISO timestamp', () => {
    mockDiscordBotManager.getActiveCount.mockReturnValue(0);
    const result = controller.getHealth();
    expect(() => new Date(result.timestamp)).not.toThrow();
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('should call getActiveCount on the bot manager', () => {
    mockDiscordBotManager.getActiveCount.mockReturnValue(3);
    controller.getHealth();
    expect(mockDiscordBotManager.getActiveCount).toHaveBeenCalledOnce();
  });

  it('should return all expected keys', () => {
    mockDiscordBotManager.getActiveCount.mockReturnValue(0);
    const result = controller.getHealth();
    expect(Object.keys(result).sort()).toEqual(
      ['activeBots', 'service', 'status', 'timestamp'].sort(),
    );
  });
});
