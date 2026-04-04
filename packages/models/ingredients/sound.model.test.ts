import { describe, expect, it, vi } from 'vitest';

vi.mock('@models/content/ingredient.model', () => ({
  Ingredient: class Ingredient {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Sound } from '@models/ingredients/sound.model';

describe('Sound', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Sound({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Sound({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
