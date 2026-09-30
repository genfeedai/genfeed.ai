import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Lighting: class BaseElementLighting {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { ElementLighting } from '@models/elements/lighting.model';

describe('ElementLighting', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new ElementLighting({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new ElementLighting({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
