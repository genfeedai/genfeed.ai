import { describe, expect, it, vi } from 'vitest';

vi.mock('@models/content/ingredient.model', () => ({
  Ingredient: class Ingredient {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Voice } from '@models/ingredients/voice.model';

describe('Voice', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Voice({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Voice({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
