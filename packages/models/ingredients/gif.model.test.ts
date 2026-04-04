import { describe, expect, it, vi } from 'vitest';

vi.mock('@models/content/ingredient.model', () => ({
  Ingredient: class Ingredient {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { GIF } from '@models/ingredients/gif.model';

describe('GIF', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new GIF({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new GIF({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
