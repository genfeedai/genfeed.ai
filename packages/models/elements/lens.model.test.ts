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
    it('should create an instance with partial data', () => {
      const instance = new ElementLens({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
