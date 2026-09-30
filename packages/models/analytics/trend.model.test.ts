import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Trend: class BaseTrend {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Trend } from '@models/analytics/trend.model';

describe('Trend', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Trend({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Trend({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
