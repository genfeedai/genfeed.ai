import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Scene: class BaseElementScene {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { ElementScene } from '@models/elements/scene.model';

describe('ElementScene', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new ElementScene({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new ElementScene({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
