import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Credit: class BaseCredit {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Credit } from '@models/billing/credit.model';

describe('Credit', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Credit({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Credit({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
