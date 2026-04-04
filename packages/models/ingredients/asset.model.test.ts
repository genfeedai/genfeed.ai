import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Asset: class BaseAsset {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/auth/user.model', () => ({
  User: class User {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Asset } from '@models/ingredients/asset.model';

describe('Asset', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Asset({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Asset({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
