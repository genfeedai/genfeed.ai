import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  CameraMovement: class BaseElementCameraMovement {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { ElementCameraMovement } from '@models/elements/camera-movement.model';

describe('ElementCameraMovement', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new ElementCameraMovement({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new ElementCameraMovement({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
