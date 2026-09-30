import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Role: class BaseRole {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Role } from '@models/auth/role.model';

describe('Role', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Role({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Role({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
