import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Blacklist: class BaseElementBlacklist {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { ElementBlacklist } from '@models/elements/blacklist.model';

describe('ElementBlacklist', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new ElementBlacklist({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new ElementBlacklist({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
