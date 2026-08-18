import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Training: class BaseTraining {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/ingredients/image.model', () => ({
  Image: class Image {
    constructor(partial: Record<string, unknown> = {}) {
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
      const instance = new Training({ id: 'test-123' } as never);
      expect(instance).toBeDefined();
    });

    it('maps source ids onto Image instances', () => {
      const instance = new Training({
        sources: ['img-1', 'img-2'],
      } as never);
      expect(instance.sources).toHaveLength(2);
      expect(instance.sources?.[0]).toMatchObject({ id: 'img-1' });
      expect(instance.sources?.[1]).toMatchObject({ id: 'img-2' });
    });
  });
});
