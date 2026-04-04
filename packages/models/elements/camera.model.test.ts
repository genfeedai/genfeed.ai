import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Camera: class BaseElementCamera {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { ElementCamera } from '@models/elements/camera.model';

describe('ElementCamera', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new ElementCamera({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new ElementCamera({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
