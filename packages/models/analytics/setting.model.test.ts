import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Setting: class BaseSetting {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Setting } from '@models/analytics/setting.model';

describe('Setting', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Setting({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Setting({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
