import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Asset: class BaseAsset {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/auth/user.model', () => ({
  User: class User {
    constructor(partial: Record<string, unknown> = {}) {
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
      const instance = new Asset({ id: 'test-123' } as never);
      expect(instance).toBeDefined();
    });

    it('hydrates a user object that carries an id', () => {
      const instance = new Asset({
        user: { id: 'user-1' },
      } as never);
      expect(instance.user).toMatchObject({ id: 'user-1' });
    });

    it('skips hydration when user is not an object with id', () => {
      const instance = new Asset({
        user: 'user-1',
      } as never);
      expect(instance.user).toBe('user-1');
    });
  });
});
