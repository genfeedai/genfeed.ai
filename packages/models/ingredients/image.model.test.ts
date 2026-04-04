import { describe, expect, it, vi } from 'vitest';

vi.mock('@models/content/ingredient.model', () => ({
  Ingredient: class Ingredient {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Image } from '@models/ingredients/image.model';

describe('Image', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Image({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Image({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
