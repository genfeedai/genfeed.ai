import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';

const mockSlackBotManager = {
  getActiveCount: vi.fn(),
};

vi.mock('@slack/services/slack-bot-manager.service', () => ({
  SlackBotManager: vi.fn().mockImplementation(() => mockSlackBotManager),
}));

import { SlackBotManager } from '@slack/services/slack-bot-manager.service';

describe('HealthController (Slack)', () => {
  let controller: HealthController;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: SlackBotManager, useValue: mockSlackBotManager }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return status ok', () => {
    mockSlackBotManager.getActiveCount.mockReturnValue(0);
    const result = controller.getHealth();
    expect(result.status).toBe('ok');
  });

  it('should return service name slack', () => {
    mockSlackBotManager.getActiveCount.mockReturnValue(0);
    const result = controller.getHealth();
    expect(result.service).toBe('slack');
  });

  it('should return active bot count from manager', () => {
    mockSlackBotManager.getActiveCount.mockReturnValue(7);
    const result = controller.getHealth();
    expect(result.activeBots).toBe(7);
  });

  it('should return zero when no bots active', () => {
    mockSlackBotManager.getActiveCount.mockReturnValue(0);
    const result = controller.getHealth();
    expect(result.activeBots).toBe(0);
  });

  it('should return a valid ISO timestamp', () => {
    mockSlackBotManager.getActiveCount.mockReturnValue(0);
    const result = controller.getHealth();
    expect(() => new Date(result.timestamp)).not.toThrow();
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('should call getActiveCount on the bot manager', () => {
    mockSlackBotManager.getActiveCount.mockReturnValue(2);
    controller.getHealth();
    expect(mockSlackBotManager.getActiveCount).toHaveBeenCalledOnce();
  });

  it('should return all expected keys', () => {
    mockSlackBotManager.getActiveCount.mockReturnValue(0);
    const result = controller.getHealth();
    expect(Object.keys(result).sort()).toEqual(
      ['activeBots', 'service', 'status', 'timestamp'].sort(),
    );
  });
});
