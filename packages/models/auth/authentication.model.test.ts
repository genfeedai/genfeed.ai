import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Authentication: class BaseAuthentication {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Authentication } from '@models/auth/authentication.model';

describe('Authentication', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Authentication({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Authentication({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
