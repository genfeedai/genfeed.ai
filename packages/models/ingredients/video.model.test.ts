import { describe, expect, it, vi } from 'vitest';

vi.mock('@models/content/ingredient.model', () => ({
  Ingredient: class Ingredient {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Video } from '@models/ingredients/video.model';

describe('Video', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Video({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Video({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
