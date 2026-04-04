import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Lens: class BaseElementLens {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { ElementLens } from '@models/elements/lens.model';

describe('ElementLens', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new ElementLens({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new ElementLens({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
