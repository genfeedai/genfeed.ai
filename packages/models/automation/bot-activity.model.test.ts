import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  BotActivity: class BaseBotActivity {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { BotActivity } from '@models/automation/bot-activity.model';

describe('BotActivity', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new BotActivity({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new BotActivity({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
