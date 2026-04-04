import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Training: class BaseTraining {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/ingredients/image.model', () => ({
  Image: class Image {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Training } from '@models/ai/training.model';

describe('Training', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Training({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Training({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
